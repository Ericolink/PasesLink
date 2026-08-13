// Borra permanentemente un pedido del Historial de ventas — más
// restrictivo que cancelConcessionOrder a propósito: solo manageConcessions
// (organizador/coanfitrión con ese permiso, o admin), nunca confirmPayments
// ni el encargado de caja. Ver functions/src/concessions/deleteConcessionOrder.ts
// para la máquina de reversión de stock/soldCount.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { deleteConcessionOrder as deleteConcessionOrderService } from '../concessions/deleteConcessionOrder.js'
import { hasPermission } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface DeleteConcessionOrderInput {
  eventId: string
  orderId: string
}

// timeoutSeconds bajo: una sola transacción, sin llamadas externas.
export const deleteConcessionOrder = onCall<DeleteConcessionOrderInput>({ timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'deleteConcessionOrder', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, orderId } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !orderId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para borrar el pedido.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    const event = eventSnap.data()!
    if (!hasPermission(event, request.auth.uid, 'manageConcessions', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para borrar pedidos de este evento.')
    }

    const result = await deleteConcessionOrderService(db, eventId, orderId)
    if (result.status === 'not_found') {
      throw new HttpsError('not-found', 'El pedido no existe.')
    }

    logBusinessEvent(ctx.logger, BUSINESS_EVENTS.CONCESSION_ORDER_DELETED, { eventId, orderId })
    return { ok: true }
  }),
)
