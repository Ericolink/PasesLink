// Borrado PERMANENTE de un pedido de concesiones — a diferencia de
// cancelConcessionOrder (que solo cambia `paymentPhase`/`fulfillmentStatus`
// y conserva el documento para el historial), esto elimina de verdad
// concessionsOrders + concessionsFulfillment. Pensado para limpiar pedidos
// de prueba desde el Historial de ventas (ConcessionSalesHistoryPanel), no
// para uso operativo normal durante el evento — de ahí que solo
// manageConcessions pueda invocarlo (ver callable/deleteConcessionOrder.ts),
// más restrictivo que confirmPayments/staff de caja.
//
// Revierte tanto `stockRemaining` como `soldCount` de cada línea (a
// diferencia de releaseReservedStock, que solo toca stock) — el criterio es
// que borrar un pedido debe dejar el catálogo exactamente como si ese
// pedido nunca hubiera existido, no solo como una cancelación más.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'

export type DeleteConcessionOrderResult =
  | { status: 'success' }
  | { status: 'not_found' }

export async function deleteConcessionOrder(
  db: Firestore,
  eventId: string,
  orderId: string,
): Promise<DeleteConcessionOrderResult> {
  const eventRef = db.collection('events').doc(eventId)
  const orderRef = eventRef.collection('concessionsOrders').doc(orderId)
  const fulfillmentRef = eventRef.collection('concessionsFulfillment').doc(orderId)

  return db.runTransaction(async (tx) => {
    const [orderSnap, fulfillmentSnap] = await Promise.all([tx.get(orderRef), tx.get(fulfillmentRef)])
    if (!orderSnap.exists) return { status: 'not_found' }
    const order = orderSnap.data()!

    const orderLines = (order.items as { itemId: string; quantity: number }[]) || []
    const itemRefs = orderLines.map((line) => eventRef.collection('concessionsCatalog').doc(line.itemId))
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))

    // Un ítem ya archivado/inexistente no tiene a dónde devolver
    // stock/soldCount — se ignora esa línea en vez de fallar el borrado
    // entero (mismo criterio que releaseReservedStock.ts).
    itemSnaps.forEach((snap, i) => {
      if (!snap.exists) return
      const item = snap.data()!
      const quantity = orderLines[i].quantity
      const update: Record<string, unknown> = {
        soldCount: FieldValue.increment(-quantity),
        updatedAt: FieldValue.serverTimestamp(),
      }
      if (item.stockMode === 'limited') {
        const remaining = ((item.stockRemaining as number) ?? 0) + quantity
        update.stockRemaining = remaining
        if (item.status === 'outOfStock' && remaining > 0) update.status = 'active'
      }
      tx.update(itemRefs[i], update)
    })

    tx.delete(orderRef)
    if (fulfillmentSnap.exists) tx.delete(fulfillmentRef)

    return { status: 'success' }
  })
}
