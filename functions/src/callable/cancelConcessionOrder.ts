// Cancelación de un pedido de concesiones por el organizador/coanfitrión con
// manageConcessions o confirmPayments — reemplaza la transacción de cliente
// que existía antes en src/firebase/concessions.ts. A diferencia de
// cancelOwnConcessionOrder (autocancelación del invitado, que sigue siendo
// cliente), esta SIEMPRE libera el stock reservado. Toda la máquina de
// estados vive en functions/src/concessions/cancelConcessionOrder.ts.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import {
  cancelConcessionOrder as cancelConcessionOrderService,
  type ConcessionCancelReason,
} from '../concessions/cancelConcessionOrder.js'
import { canConfirmPayments, canManageConcessions } from '../lib/permissions.js'

interface CancelConcessionOrderInput {
  eventId: string
  orderId: string
  cancelReason: ConcessionCancelReason
}

export const cancelConcessionOrder = onCall<CancelConcessionOrderInput>(async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
  }
  const { eventId, orderId, cancelReason } = request.data || {}
  if (!eventId || !orderId || !cancelReason) {
    throw new HttpsError('invalid-argument', 'Faltan datos para cancelar el pedido.')
  }

  const db = getFirestore()
  const eventSnap = await db.collection('events').doc(eventId).get()
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'El evento no existe.')
  }
  const event = eventSnap.data()!
  if (!canManageConcessions(event, request.auth.uid) && !canConfirmPayments(event, request.auth.uid)) {
    throw new HttpsError('permission-denied', 'No tienes permiso para cancelar pedidos en este evento.')
  }

  const result = await cancelConcessionOrderService(db, eventId, orderId, cancelReason)
  if (result.status === 'not_found') {
    throw new HttpsError('not-found', 'El pedido no existe.')
  }

  return { ok: true }
})
