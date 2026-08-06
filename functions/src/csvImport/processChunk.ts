// Procesa UN chunk (hasta ROWS_PER_CHUNK filas) de una importación CSV —
// invocado por processCsvImportChunk.ts (Cloud Tasks) una vez por chunk,
// nunca por el cliente directo. Reutiliza createGuestsWithCapacity tal cual
// (mismo cupo/lista de espera/contadores que addGuest/addGuestsBulk) y las
// mismas validaciones de forma que antes vivían en la callable
// addGuestsFromRows — la diferencia real de comportamiento es que ahora una
// fila inválida se RECHAZA y se sigue con el resto, en vez de abortar todo
// el archivo por un solo error de tipeo (addGuestsFromRows.ts validaba TODO
// antes de escribir el primer lote; acá cada fila es independiente, más
// apropiado para un job en background con miles de filas).
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { createGuestsWithCapacity, type GuestWrite } from '../capacity/createGuests.js'
import {
  GUEST_EMAIL_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  requireValidEmail,
} from '../lib/guestValidation.js'
import type { Logger } from '../lib/observability/logger.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'
import type { CsvImportRowInput } from './types.js'

interface RejectedRow {
  name: string
  reason: string
}

function buildGuestWrite(row: CsvImportRowInput): { guest: GuestWrite } | { rejected: RejectedRow } {
  try {
    const name = requireMaxLength(requireNonEmpty(row.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
    const lastName = row.lastName?.trim() ? requireMaxLength(row.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido') : ''
    const phone = row.phone?.trim() ? requireMaxLength(row.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
    // Minúsculas: mismo criterio que registerWalkInGuest.ts — permite que
    // reclaimInvitationsByEmail encuentre este contacto por igualdad exacta
    // contra el email verificado de la cuenta.
    const email = row.email?.trim()
      ? requireMaxLength(requireValidEmail(row.email.trim().toLowerCase(), 'El email'), GUEST_EMAIL_MAX, 'El email')
      : ''
    return {
      guest: {
        name,
        lastName,
        companions: [],
        contact: phone || email ? { phone: phone || undefined, email: email || undefined } : undefined,
      },
    }
  } catch (err) {
    const reason = err instanceof GuestValidationError ? err.message : 'Fila inválida.'
    return { rejected: { name: `${row.name || ''} ${row.lastName || ''}`.trim() || '(sin nombre)', reason } }
  }
}

export interface ChunkProcessOutcome {
  /** Índice del próximo chunk a encolar, o null si no corresponde encolar nada más (job terminado, cancelado, o entrega duplicada de una tarea ya procesada). */
  nextChunkIndex: number | null
}

const TERMINAL_STATUSES = new Set(['cancelled', 'failed', 'completed', 'completed_with_errors'])

// Idempotencia vía CURSOR (`job.nextChunkIndex`), no vía el status del
// chunk: es la única fuente de verdad de qué chunk falta procesar. Una
// entrega duplicada de Cloud Tasks (at-least-once por diseño) sobre un
// chunk ya reflejado en el cursor es un no-op seguro, y como el chunk
// siguiente NO se encola hasta que el cursor avanza, un job nunca puede
// quedar trabado por una entrega duplicada. La única ventana de riesgo que
// queda: si ESTA MISMA invocación crea invitados y se cae antes de que la
// transacción de abajo confirme, un reintento repetiría
// createGuestsWithCapacity para las mismas filas (posible duplicado) — cerrar
// esa ventana del todo requeriría IDs determinísticos por fila, fuera de
// alcance de este cambio (la estructura por chunks ya deja el terreno listo
// para agregarlo después sin rediseñar nada).
export async function runCsvImportChunk(
  db: Firestore,
  eventId: string,
  jobId: string,
  chunkIndex: number,
  logger: Logger,
): Promise<ChunkProcessOutcome> {
  const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
  const chunkRef = jobRef.collection('chunks').doc(String(chunkIndex))

  const [jobSnap, chunkSnap] = await Promise.all([jobRef.get(), chunkRef.get()])
  if (!jobSnap.exists || !chunkSnap.exists) {
    logger.warn('runCsvImportChunk: job o chunk inexistente', { chunkIndex })
    return { nextChunkIndex: null }
  }

  const job = jobSnap.data()!
  if (TERMINAL_STATUSES.has(job.status as string)) {
    logger.info('runCsvImportChunk: job ya no está activo, se descarta el chunk', { chunkIndex, jobStatus: job.status })
    return { nextChunkIndex: null }
  }
  if ((job.nextChunkIndex as number) > chunkIndex) {
    logger.info('runCsvImportChunk: chunk ya procesado (entrega duplicada de Cloud Tasks), no-op', { chunkIndex })
    return { nextChunkIndex: null }
  }

  if (job.status === 'pending') {
    await jobRef.update({ status: 'processing', startedAt: FieldValue.serverTimestamp() })
  }

  const rows = (chunkSnap.data()!.rows || []) as CsvImportRowInput[]
  const guestWrites: GuestWrite[] = []
  const rejected: RejectedRow[] = []
  for (const row of rows) {
    const built = buildGuestWrite(row)
    if ('guest' in built) guestWrites.push(built.guest)
    else rejected.push(built.rejected)
  }

  const result = guestWrites.length > 0
    ? await createGuestsWithCapacity(db, eventId, guestWrites, 'best-fit')
    : { createdIds: [], skipped: [] }
  for (const skipped of result.skipped) {
    rejected.push({ name: `${skipped.name} ${skipped.lastName || ''}`.trim(), reason: 'Cupo del evento alcanzado.' })
  }

  const addedCount = result.createdIds.length
  const rejectedCount = rejected.length
  const totalChunks = job.totalChunks as number
  const isLastChunk = chunkIndex + 1 >= totalChunks

  // Chunk + contadores del job avanzan JUNTOS en una sola transacción: así
  // el cursor (nextChunkIndex) y lo que ya se contabilizó nunca quedan
  // desincronizados entre sí, sin importar en qué momento se caiga el resto
  // del proceso.
  let advanced = false
  let finalSuccessCount = 0
  let finalFailedCount = 0
  await db.runTransaction(async (tx) => {
    const freshJobSnap = await tx.get(jobRef)
    const freshJob = freshJobSnap.data()!
    if ((freshJob.nextChunkIndex as number) !== chunkIndex) return // ya avanzado por otra entrega — no duplicar el conteo

    const processedRows = (freshJob.processedRows as number) + rows.length
    const successCount = (freshJob.successCount as number) + addedCount
    const failedCount = (freshJob.failedCount as number) + rejectedCount
    const totalRows = freshJob.totalRows as number
    const progressPercent = totalRows > 0 ? Math.min(100, Math.round((processedRows / totalRows) * 100)) : 100

    const patch: Record<string, unknown> = {
      processedRows,
      successCount,
      failedCount,
      progressPercent,
      nextChunkIndex: chunkIndex + 1,
    }
    if (isLastChunk) {
      patch.status = failedCount > 0 ? 'completed_with_errors' : 'completed'
      patch.completedAt = FieldValue.serverTimestamp()
    }
    tx.update(jobRef, patch)
    tx.update(chunkRef, {
      status: 'done',
      addedCount,
      rejectedCount,
      // Muestra acotada — evita que un archivo con muchos rechazos infle el
      // doc del chunk; alcanza para diagnosticar sin loguear fila por fila.
      rejectedSamples: rejected.slice(0, 20),
      processedAt: FieldValue.serverTimestamp(),
    })
    advanced = true
    finalSuccessCount = successCount
    finalFailedCount = failedCount
  })

  // Un log estructurado por CHUNK (no por invitado) — cumple con evitar
  // logs excesivos y sigue alcanzando para diagnosticar en Cloud Logging.
  logger.info('runCsvImportChunk: chunk procesado', { chunkIndex, addedCount, rejectedCount, isLastChunk, advanced })

  if (advanced && isLastChunk) {
    logBusinessEvent(logger, BUSINESS_EVENTS.GUEST_ADDED_BULK, {
      eventId, source: 'csv_import', added: finalSuccessCount, skipped: finalFailedCount,
    })
  }

  if (!advanced || isLastChunk) return { nextChunkIndex: null }
  return { nextChunkIndex: chunkIndex + 1 }
}

export async function markCsvImportJobFailed(db: Firestore, eventId: string, jobId: string, errorMessage: string): Promise<void> {
  const jobRef = db.collection('events').doc(eventId).collection('csvImportJobs').doc(jobId)
  await jobRef.update({
    status: 'failed',
    errorMessage: errorMessage.slice(0, 500),
    completedAt: FieldValue.serverTimestamp(),
  })
}
