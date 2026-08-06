// Devuelve al catálogo el stock reservado por cada línea de un pedido —
// compartido por cancelConcessionOrder.ts (cancelación manual del
// organizador/staff) y sweepAbandonedOrders.ts (borrado automático de
// pedidos abandonados). Mismo criterio que isValidConcessionStockRelease en
// firestore.rules: un ítem ya archivado no tiene a dónde devolver stock, se
// ignora esa línea en vez de fallar la operación entera.
import { FieldValue } from 'firebase-admin/firestore'
import type { DocumentReference, DocumentSnapshot, Transaction } from 'firebase-admin/firestore'

export function releaseReservedStock(
  tx: Transaction,
  itemRefs: DocumentReference[],
  itemSnaps: DocumentSnapshot[],
  orderLines: { quantity: number }[],
): void {
  itemSnaps.forEach((snap, i) => {
    if (!snap.exists) return
    const item = snap.data()!
    if (item.stockMode !== 'limited') return
    const remaining = ((item.stockRemaining as number) ?? 0) + orderLines[i].quantity
    tx.update(itemRefs[i], {
      stockRemaining: remaining,
      ...(item.status === 'outOfStock' && remaining > 0 ? { status: 'active' } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    })
  })
}
