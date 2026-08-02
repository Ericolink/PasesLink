// Reemplaza la transacción de cliente que existía antes en
// src/firebase/guests.ts. Toda la máquina de estados vive en
// functions/src/checkin/checkOut.ts.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { checkOutGuest as checkOutGuestService } from '../checkin/checkOut.js'
import { canScanQr } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface CheckOutGuestInput {
  eventId: string
  qrToken: string
  kind: 'temporary' | 'final'
}

const VALID_KINDS = ['temporary', 'final']

// region fija la misma ubicación que Firestore (us-central1). Sin
// minInstances: la salida es menos sensible a 1-2s de cold start que el
// ingreso (menor presión de tráfico que la puerta al inicio del evento).
export const checkOutGuest = onCall<CheckOutGuestInput>(
  { region: 'us-central1', maxInstances: 10 },
  (request) => withCallableObservability(request, 'checkOutGuest', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, qrToken, kind } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !qrToken || !VALID_KINDS.includes(kind)) {
      throw new HttpsError('invalid-argument', 'Faltan datos para registrar la salida.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canScanQr(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para escanear salidas en este evento.')
    }

    return checkOutGuestService(db, eventId, qrToken, request.auth.uid, request.auth.token.email ?? null, kind)
  }),
)
