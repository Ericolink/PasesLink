// Target HTTP de Cloud Tasks para el pipeline de importación CSV — la cadena
// completa es: startCsvImport (callable) crea el job + encola chunk 0; esta
// función procesa un chunk y, si queda más por hacer, encola el siguiente
// (self-chaining) en vez de que una sola invocación intente todo el
// archivo. onRequest (no onCall): acá nunca hay un usuario de Firebase Auth
// autenticado, solo Cloud Tasks con su propio token OIDC — la identidad se
// controla en el DESPLIEGUE (`invoker: 'private'` + el rol
// roles/cloudfunctions.invoker otorgado únicamente a la service account
// dedicada csv-import-tasks@, ver resumen de despliegue), no leyendo el
// token acá. El body tampoco se confía más allá de su forma: a quién
// pertenece el job, si ya se procesó, si sigue activo — todo se revalida
// contra Firestore dentro de runCsvImportChunk.
import { onRequest } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { createRequestContext } from '../lib/observability/context.js'
import { createLogger } from '../lib/observability/logger.js'
import { markCsvImportJobFailed, runCsvImportChunk } from '../csvImport/processChunk.js'
import { enqueueCsvImportChunk } from '../csvImport/queue.js'
import { MAX_TASK_ATTEMPTS } from '../csvImport/config.js'

interface CsvImportChunkPayload {
  eventId?: unknown
  jobId?: unknown
  chunkIndex?: unknown
}

export const processCsvImportChunk = onRequest(
  { region: 'us-central1', timeoutSeconds: 120, memory: '256MiB', maxInstances: 20, invoker: 'private' },
  async (req, res) => {
    const ctx = createRequestContext('processCsvImportChunk')
    const logger = createLogger(ctx)

    const body = (req.body || {}) as CsvImportChunkPayload
    const eventId = typeof body.eventId === 'string' ? body.eventId : null
    const jobId = typeof body.jobId === 'string' ? body.jobId : null
    const chunkIndex = typeof body.chunkIndex === 'number' ? body.chunkIndex : null
    if (!eventId || !jobId || chunkIndex === null) {
      logger.error('processCsvImportChunk: payload inválido', { body: req.body })
      res.status(400).send('invalid payload')
      return
    }
    ctx.addContext({ eventId, jobId, chunkIndex })

    // Cloud Tasks incrementa este header en cada reintento del MISMO task —
    // permite distinguir "reintentar" de "ya se agotaron los intentos, hay
    // que rendirse y marcar el job failed" sin necesitar estado propio.
    const retryCount = Number(req.header('X-CloudTasks-TaskRetryCount') || '0')
    const db = getFirestore()

    try {
      const { nextChunkIndex } = await runCsvImportChunk(db, eventId, jobId, chunkIndex, logger)
      if (nextChunkIndex !== null) {
        await enqueueCsvImportChunk({ eventId, jobId, chunkIndex: nextChunkIndex })
      }
      logger.info('processCsvImportChunk: éxito', { durationMs: ctx.elapsedMs(), nextChunkIndex })
      res.status(200).send('ok')
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err))
      logger.error('processCsvImportChunk: error procesando chunk', { error, retryCount, durationMs: ctx.elapsedMs() })
      if (retryCount >= MAX_TASK_ATTEMPTS - 1) {
        await markCsvImportJobFailed(db, eventId, jobId, error.message).catch(() => {})
        // 200 a propósito: ya se agotaron los intentos, un 5xx acá solo
        // haría que Cloud Tasks lo siga reintentando de más.
        res.status(200).send('giving up after max attempts')
        return
      }
      res.status(500).send('retry')
    }
  },
)
