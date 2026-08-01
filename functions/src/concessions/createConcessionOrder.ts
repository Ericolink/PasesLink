// Servicio puro de checkout de concesiones — Admin SDK, sin HttpsError ni
// chequeo de permisos acá (eso vive en la Callable que lo invoca, ver
// callable/createConcessionOrder.ts). Puerto de createConcessionOrder() en
// src/firebase/concessions.ts, misma transacción (reserva de stock + crea
// pedido + proyección de cocina a la vez), con la mejora real de esta
// migración: nadie puede saltearse esta función y fabricar un
// subtotalMinorUnits/totalMinorUnits que no coincida con el catálogo real —
// antes ese cálculo lo hacía honestamente el cliente, pero firestore.rules no
// podía volver a verificarlo contra el catálogo (ver el comentario de
// isValidConcessionOrderCreate en firestore.rules).
import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { guestLockTokensOk } from '../lib/permissions.js'

export interface ConcessionOrderLineInput {
  itemId: string
  quantity: number
}

export interface CreateConcessionOrderInput {
  guestId: string
  guestNameSnapshot: string
  lockToken: string | null
  currency: string
  paymentMethod: 'transfer' | 'cash' | null
  lines: ConcessionOrderLineInput[]
}

export type CreateConcessionOrderResult =
  | { status: 'success'; orderId: string }
  | { status: 'event_not_found' }
  | { status: 'not_enabled' }
  | { status: 'forbidden' }
  | { status: 'checkout_error'; message: string; itemId?: string }

export async function createConcessionOrder(
  db: Firestore,
  eventId: string,
  input: CreateConcessionOrderInput,
): Promise<CreateConcessionOrderResult> {
  const eventRef = db.collection('events').doc(eventId)
  const guestRef = eventRef.collection('guests').doc(input.guestId)
  const itemRefs = input.lines.map((line) => eventRef.collection('concessionsCatalog').doc(line.itemId))
  const orderRef = eventRef.collection('concessionsOrders').doc()
  const fulfillmentRef = eventRef.collection('concessionsFulfillment').doc(orderRef.id)
  // Código corto legible, no un contador incremental por evento — mismo
  // motivo ya documentado en src/firebase/concessions.ts (evita un documento
  // caliente en una ráfaga de pedidos simultáneos).
  const orderNumber = orderRef.id.slice(0, 6).toUpperCase()

  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    if (!eventSnap.exists) return { status: 'event_not_found' }
    const event = eventSnap.data()!
    if ((event.concessions as DocumentData | undefined)?.enabled !== true) return { status: 'not_enabled' }

    const guestSnap = await tx.get(guestRef)
    if (!guestSnap.exists || !guestLockTokensOk(guestSnap.data()!, input.lockToken)) {
      return { status: 'forbidden' }
    }

    const itemSnaps = await Promise.all(itemRefs.map((ref) => tx.get(ref)))

    // El precio y la disponibilidad SIEMPRE salen de este doc recién leído
    // dentro de la transacción — nunca de nada que el cliente haya mandado.
    const items: { id: string; name: string; category: string; priceMinorUnits: number; stockMode: string; stockRemaining?: number }[] = []
    for (let i = 0; i < itemSnaps.length; i++) {
      const snap = itemSnaps[i]
      const line = input.lines[i]
      if (!snap.exists) {
        return { status: 'checkout_error', message: 'Este producto ya no está disponible', itemId: line.itemId }
      }
      const data = snap.data()!
      if (data.status !== 'active') {
        return { status: 'checkout_error', message: `"${data.name}" ya no está disponible`, itemId: line.itemId }
      }
      const stockRemaining = typeof data.stockRemaining === 'number' ? data.stockRemaining : undefined
      if (data.stockMode === 'limited' && (stockRemaining ?? 0) < line.quantity) {
        return { status: 'checkout_error', message: `Solo quedan ${stockRemaining ?? 0} de "${data.name}"`, itemId: line.itemId }
      }
      items.push({
        id: snap.id,
        name: (data.name as string) || '',
        category: (data.category as string) || 'special',
        priceMinorUnits: (data.priceMinorUnits as number) ?? 0,
        stockMode: (data.stockMode as string) || 'unlimited',
        stockRemaining,
      })
    }

    const orderLines: Record<string, unknown>[] = []
    const fulfillmentLines: Record<string, unknown>[] = []
    let subtotalMinorUnits = 0
    let itemCount = 0

    items.forEach((item, i) => {
      const quantity = input.lines[i].quantity
      const lineTotalMinorUnits = item.priceMinorUnits * quantity
      subtotalMinorUnits += lineTotalMinorUnits
      itemCount += quantity
      orderLines.push({
        itemId: item.id,
        nameSnapshot: item.name,
        categorySnapshot: item.category,
        unitPriceMinorUnitsSnapshot: item.priceMinorUnits,
        quantity,
        lineTotalMinorUnits,
      })
      fulfillmentLines.push({ nameSnapshot: item.name, categorySnapshot: item.category, quantity })
    })

    // Reserva de inventario dentro de la misma transacción que crea el
    // pedido — dos invitados compitiendo por el último producto nunca pueden
    // agotarlo dos veces (Firestore reintenta/serializa transacciones en
    // conflicto sobre el mismo documento).
    items.forEach((item, i) => {
      const quantity = input.lines[i].quantity
      if (item.stockMode !== 'limited') {
        tx.update(itemRefs[i], { soldCount: FieldValue.increment(quantity), updatedAt: FieldValue.serverTimestamp() })
        return
      }
      const remaining = (item.stockRemaining ?? 0) - quantity
      tx.update(itemRefs[i], {
        stockRemaining: remaining,
        soldCount: FieldValue.increment(quantity),
        ...(remaining <= 0 ? { status: 'outOfStock' } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      })
    })

    const isFree = subtotalMinorUnits === 0

    tx.set(orderRef, {
      eventId,
      guestId: input.guestId,
      guestNameSnapshot: input.guestNameSnapshot,
      items: orderLines,
      subtotalMinorUnits,
      totalMinorUnits: subtotalMinorUnits,
      currency: input.currency,
      itemCount,
      paymentMethod: isFree ? null : input.paymentMethod,
      paymentPhase: isFree ? 'confirmed' : 'awaiting_payment',
      lockToken: input.lockToken,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      ...(isFree ? { paidAt: FieldValue.serverTimestamp() } : {}),
    })

    tx.set(fulfillmentRef, {
      eventId,
      guestId: input.guestId,
      guestNameSnapshot: input.guestNameSnapshot,
      orderNumber,
      lines: fulfillmentLines,
      fulfillmentStatus: isFree ? 'queued' : 'not_ready',
      lockToken: input.lockToken,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    })

    return { status: 'success', orderId: orderRef.id }
  })
}
