// Limpieza automática de pedidos de concesiones abandonados — checkouts que
// reservaron stock e items del pedido, pero nunca llegaron a un estado
// terminal favorable (pagado/confirmado) ni desfavorable-pero-manejado
// (cancelado por staff). Reutiliza releaseReservedStock (mismo helper que
// cancelConcessionOrder.ts) para nunca dejar stock fantasma reservado.
//
// "Abandonado" = paymentPhase en ('awaiting_payment', 'rejected') Y sin
// cambios (updatedAt) desde hace más de ABANDONED_ORDER_THRESHOLD_MS. Se
// excluye a propósito:
// - 'proof_submitted': el invitado ya actuó, la pelota está del lado del
//   staff (confirmar/rechazar) — borrarlo destruiría un comprobante en
//   revisión.
// - 'confirmed': pagado, nunca se toca.
// - 'cancelled': ya fue manejado explícitamente (cancelConcessionOrder), no
//   es "abandonado", es responsabilidad de una limpieza aparte si hiciera falta.
//
// isAbandonedConcessionOrder() es la única fuente de verdad: la usa tanto el
// filtro (barato, aproximado) de la query del barrido como la relectura
// (exacta) dentro de la transacción de borrado — así un pedido que cambia de
// estado entre el momento de la query y el de su transacción individual
// (p.ej. el invitado sube el comprobante en ese instante) nunca se borra por
// una condición de carrera.
import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { releaseReservedStock } from './releaseReservedStock.js'

export const ABANDONED_ORDER_THRESHOLD_MS = 48 * 60 * 60 * 1000 // 48 horas
const DEFAULT_SWEEP_BATCH_SIZE = 200
const ABANDONED_PAYMENT_PHASES = new Set(['awaiting_payment', 'rejected'])

export function isAbandonedConcessionOrder(order: DocumentData, nowMs: number): boolean {
  const paymentPhase = order.paymentPhase as string | undefined
  if (!paymentPhase || !ABANDONED_PAYMENT_PHASES.has(paymentPhase)) return false
  const updatedAtMs = (order.updatedAt as Timestamp | undefined)?.toMillis() ?? 0
  return nowMs - updatedAtMs >= ABANDONED_ORDER_THRESHOLD_MS
}

export type DeleteAbandonedOrderResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'not_eligible' }

export async function deleteAbandonedConcessionOrder(
  db: Firestore,
  eventId: string,
  orderId: string,
  nowMs: number,
): Promise<DeleteAbandonedOrderResult> {
  const eventRef = db.collection('events').doc(eventId)
  const orderRef = eventRef.collection('concessionsOrders').doc(orderId)
  const fulfillmentRef = eventRef.collection('concessionsFulfillment').doc(orderId)

  return db.runTransaction(async (tx) => {
    const [orderSnap, fulfillmentSnap] = await Promise.all([tx.get(orderRef), tx.get(fulfillmentRef)])
    if (!orderSnap.exists) return { status: 'not_found' }
    const order = orderSnap.data()!
    // Releído fresco dentro de la transacción: aunque la query del barrido
    // ya filtró por estado+antigüedad, este pedido puede haber cambiado
    // (comprobante subido, pago confirmado) en el instante entre esa query
    // y esta transacción individual.
    if (!isAbandonedConcessionOrder(order, nowMs)) return { status: 'not_eligible' }

    const orderLines = (order.items as { itemId: string; quantity: number }[]) || []
    const itemRefs = orderLines.map((line) => eventRef.collection('concessionsCatalog').doc(line.itemId))
    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))
    releaseReservedStock(tx, itemRefs, itemSnaps, orderLines)

    tx.delete(orderRef)
    if (fulfillmentSnap.exists) tx.delete(fulfillmentRef)

    return { status: 'deleted' }
  })
}

export interface SweepAbandonedOrdersResult {
  candidates: number
  deleted: number
  skipped: number
}

export async function runAbandonedConcessionOrdersSweep(
  db: Firestore,
  nowMs: number,
  options: { limit?: number } = {},
): Promise<SweepAbandonedOrdersResult> {
  const limit = options.limit ?? DEFAULT_SWEEP_BATCH_SIZE
  const cutoff = Timestamp.fromMillis(nowMs - ABANDONED_ORDER_THRESHOLD_MS)

  // Solo candidatos: paymentPhase acotado + updatedAt vencido, nunca un
  // recorrido completo de la colección. `limit` acota el costo por corrida
  // sin importar cuántos pedidos abandonados se hayan acumulado — lo que no
  // entra en este lote lo procesa la próxima corrida programada (mismo
  // patrón que reconcileDirtyGuestCounters).
  const snap = await db
    .collectionGroup('concessionsOrders')
    .where('paymentPhase', 'in', ['awaiting_payment', 'rejected'])
    .where('updatedAt', '<=', cutoff)
    .orderBy('updatedAt', 'asc')
    .limit(limit)
    .get()

  const result: SweepAbandonedOrdersResult = { candidates: snap.size, deleted: 0, skipped: 0 }

  for (const docSnap of snap.docs) {
    const eventId = docSnap.ref.parent.parent?.id
    if (!eventId) {
      result.skipped += 1
      continue
    }
    const outcome = await deleteAbandonedConcessionOrder(db, eventId, docSnap.id, nowMs)
    if (outcome.status === 'deleted') result.deleted += 1
    else result.skipped += 1
  }

  return result
}
