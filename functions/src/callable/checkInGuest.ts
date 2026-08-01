// Reemplaza la transacción de cliente que existía antes en
// src/firebase/guests.ts. Toda la máquina de estados vive en
// functions/src/checkin/checkIn.ts, reusable por futuras integraciones
// (validaciones automáticas, apps móviles, APIs internas) sin duplicar nada
// de esto.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { checkInGuest as checkInGuestService } from '../checkin/checkIn.js'
import { canScanQr } from '../lib/permissions.js'

interface CheckInGuestInput {
  eventId: string
  qrToken: string
}

// minInstances: 1 — camino crítico del escáner (la puerta, al inicio del
// evento), donde un cold start es más visible y más costoso en experiencia
// (ver BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §8.3). region fija la misma
// ubicación que la base de Firestore (us-central1, confirmado con
// `firebase firestore:databases:get`) para evitar latencia cross-region.
export const checkInGuest = onCall<CheckInGuestInput>(
  { region: 'us-central1', minInstances: 1, maxInstances: 20 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, qrToken } = request.data || {}
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

    return checkInGuestService(db, eventId, qrToken, request.auth.uid, request.auth.token.email ?? null)
  },
)
