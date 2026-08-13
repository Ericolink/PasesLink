// Arranca una importación masiva de invitados por CSV en background —
// reemplaza a addGuestsFromRows (callable síncrona que bloqueaba al
// organizador hasta terminar de escribir TODO el archivo, con tope de 2000
// filas y 120s). Acá el cliente solo dispara el job y sigue usando la app;
// el progreso se sigue con subscribeToCsvImportJob (onSnapshot sobre
// events/{eventId}/csvImportJobs/{jobId}) — ver
// src/firebase/csvImportJobs.ts. El trabajo pesado (validar cada fila,
// createGuestsWithCapacity) corre en processCsvImportChunk.ts, uno o más
// chunks después, encolado en Cloud Tasks.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { hasPermission } from '../lib/permissions.js'
import { createCsvImportJob, CsvImportValidationError } from '../csvImport/createJob.js'
import { enqueueCsvImportChunk } from '../csvImport/queue.js'
import type { CsvImportRowInput } from '../csvImport/types.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface StartCsvImportInput {
  eventId: string
  fileName?: string
  rows: CsvImportRowInput[]
}

export interface StartCsvImportResponse {
  jobId: string
}

// Sin timeoutSeconds explícito: a diferencia de addGuestsFromRows, esta
// función solo escribe el job + sus chunks y encola UNA tarea — rápido,
// independiente de cuántas filas tenga el archivo.
export const startCsvImport = onCall<StartCsvImportInput>((request) =>
  withCallableObservability(request, 'startCsvImport', async (ctx): Promise<StartCsvImportResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, rows, fileName } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !Array.isArray(rows) || rows.length === 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos para importar a los invitados.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    if (!hasPermission(eventSnap.data()!, request.auth.uid, 'addGuests', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para agregar invitados a este evento.')
    }

    try {
      const { jobId } = await createCsvImportJob(db, {
        eventId,
        uid: request.auth.uid,
        uidEmail: request.auth.token.email ?? null,
        fileName: typeof fileName === 'string' ? fileName : '',
        rows,
      })
      await enqueueCsvImportChunk({ eventId, jobId, chunkIndex: 0 })
      ctx.addContext({ jobId, totalRows: rows.length })
      return { jobId }
    } catch (err) {
      if (err instanceof CsvImportValidationError) throw new HttpsError('invalid-argument', err.message)
      throw err
    }
  }),
)
