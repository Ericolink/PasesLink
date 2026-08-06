// Cancela una importación CSV en curso (ver csvImport/cancelJob.ts) — mismo
// permiso que arrancarla (addGuests): quien puede iniciar una importación
// puede detener cualquiera del evento, no solo la propia, mismo criterio
// que el resto de las acciones de gestión de invitados en este proyecto.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { canManageGuests } from '../lib/permissions.js'
import { cancelCsvImportJob as cancelCsvImportJobRecord, CsvImportCancelError } from '../csvImport/cancelJob.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface CancelCsvImportJobInput {
  eventId: string
  jobId: string
}

export const cancelCsvImportJob = onCall<CancelCsvImportJobInput>((request) =>
  withCallableObservability(request, 'cancelCsvImportJob', async (ctx): Promise<{ ok: true }> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, jobId } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !jobId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para cancelar la importación.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para cancelar esta importación.')
    }

    try {
      await cancelCsvImportJobRecord(db, eventId, jobId)
      return { ok: true }
    } catch (err) {
      if (err instanceof CsvImportCancelError) throw new HttpsError('failed-precondition', err.message)
      throw err
    }
  }),
)
