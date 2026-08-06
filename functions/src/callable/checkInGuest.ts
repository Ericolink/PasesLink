// Reemplaza la transacción de cliente que existía antes en
// src/firebase/guests.ts. Toda la máquina de estados vive en
// functions/src/checkin/checkIn.ts, reusable por futuras integraciones
// (validaciones automáticas, apps móviles, APIs internas) sin duplicar nada
// de esto.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { checkInGuest as checkInGuestService } from '../checkin/checkIn.js'
import { canScanQr } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface CheckInGuestInput {
  eventId: string
  qrToken: string
}

// minInstances: 1 — camino crítico del escáner (la puerta, al inicio del
// evento), donde un cold start es más visible y más costoso en experiencia
// (ver BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §8.3). region ya sale del
// default global (index.ts), misma ubicación que la base de Firestore.
// timeoutSeconds bajo (vs. el default de 60s): es una sola transacción sin
// llamadas externas — si tarda más de 20s algo ya está roto, y este tope
// evita que el escáner se quede colgado esperando ese resto del minuto.
export const checkInGuest = onCall<CheckInGuestInput>(
  { minInstances: 1, maxInstances: 20, timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'checkInGuest', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, qrToken } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !qrToken) {
      throw new HttpsError('invalid-argument', 'Faltan datos para registrar el ingreso.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canScanQr(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para escanear entradas en este evento.')
    }

    const result = await checkInGuestService(db, eventId, qrToken, request.auth.uid, request.auth.token.email ?? null)
    logBusinessEvent(ctx.logger, result.status === 'success' ? BUSINESS_EVENTS.CHECKIN_SUCCESS : BUSINESS_EVENTS.CHECKIN_REJECTED, { eventId, status: result.status })
    return result
  }),
)
