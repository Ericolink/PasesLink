// Servicio puro de cancelación de un pedido de concesiones por el
// organizador/staff — Admin SDK, sin HttpsError ni chequeo de permisos acá
// (eso vive en callable/cancelConcessionOrder.ts). Puerto de
// cancelConcessionOrder() en src/firebase/concessions.ts. A diferencia de
// cancelOwnConcessionOrder (autocancelación del invitado, que sigue siendo
// cliente y a propósito NO libera stock), esta SIEMPRE libera el stock
// reservado — mismo criterio que isValidConcessionStockRelease en
// firestore.rules, ahora aplicado del lado servidor.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { releaseReservedStock } from './releaseReservedStock.js'

export type CancelConcessionOrderResult =
  | { status: 'success' }
  | { status: 'not_found' }
  | { status: 'noop' }

export type ConcessionCancelReason =
  | 'guest_cancelled'
  | 'organizer_cancelled'
  | 'refunded'
  | 'item_removed'
  | 'guest_removed_from_event'
  | 'event_cancelled'

export async function cancelConcessionOrder(
  db: Firestore,
  eventId: string,
  orderId: string,
  cancelReason: ConcessionCancelReason,
): Promise<CancelConcessionOrderResult> {
  const eventRef = db.collection('events').doc(eventId)
  const orderRef = eventRef.collection('concessionsOrders').doc(orderId)
  const fulfillmentRef = eventRef.collection('concessionsFulfillment').doc(orderId)

  return db.runTransaction(async (tx) => {
    const [orderSnap, fulfillmentSnap] = await Promise.all([tx.get(orderRef), tx.get(fulfillmentRef)])
    if (!orderSnap.exists) return { status: 'not_found' }
    const order = orderSnap.data()!
    if (order.paymentPhase === 'cancelled') return { status: 'noop' }
    if (fulfillmentSnap.exists && fulfillmentSnap.data()?.fulfillmentStatus === 'delivered') return { status: 'noop' }

    const orderLines = (order.items as { itemId: string; quantity: number }[]) || []
    const itemRefs = orderLines.map((line) => eventRef.collection('concessionsCatalog').doc(line.itemId))
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))
    releaseReservedStock(tx, itemRefs, itemSnaps, orderLines)

    tx.update(orderRef, { paymentPhase: 'cancelled', cancelReason, updatedAt: FieldValue.serverTimestamp() })
    if (fulfillmentSnap.exists) {
      tx.update(fulfillmentRef, { fulfillmentStatus: 'cancelled', updatedAt: FieldValue.serverTimestamp() })
    }

    return { status: 'success' }
  })
}
