// Módulo de venta de alimentos/bebidas/souvenirs durante el evento — ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md. Fase 0 (tipos + Security Rules +
// este archivo) + Fase 1 (panel de organizador: catálogo, config, staff,
// bandeja de pagos). Sigue exactamente los mismos patrones que el resto de
// firebase/*.ts (measureSpan en cada escritura, withListenerReporting en
// cada listener, runTransaction para cualquier cosa que toque un contador o
// precise leer-antes-de-escribir, updateDoc con dot-path para mapas dentro
// del propio documento del evento — mismo patrón que addCoOrganizer en
// events.ts).
import {
  collection,
  deleteField,
  doc,
  increment,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { DocumentReference, DocumentSnapshot, Transaction, Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { measureSpan, withListenerReporting } from '../lib/sentry'
import type { PaymentMethod } from '../types'
import type {
  ConcessionCancelReason,
  ConcessionFulfillment,
  ConcessionFulfillmentLine,
  ConcessionItem,
  ConcessionItemStatus,
  ConcessionOrder,
  ConcessionOrderLine,
  ConcessionsCategory,
  ConcessionsConfig,
  FulfillmentStatus,
} from '../types/concessions'
import {
  ConcessionFulfillmentSchema,
  ConcessionItemSchema,
  ConcessionOrderSchema,
  warnIfInvalidShape,
} from '../types/schemas'
import { requireMaxLength, requireNonEmpty } from '../utils/validation'

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

function mapConcessionItem(id: string, data: Record<string, unknown>): ConcessionItem {
  const item: ConcessionItem = {
    id,
    name: (data.name as string) || '',
    description: (data.description as string) || undefined,
    category: (data.category as ConcessionsCategory) || 'special',
    imageUrl: (data.imageUrl as string) || undefined,
    priceMinorUnits: (data.priceMinorUnits as number) ?? 0,
    currency: (data.currency as string) || '',
    stockMode: (data.stockMode as 'unlimited' | 'limited') || 'unlimited',
    stockRemaining: typeof data.stockRemaining === 'number' ? data.stockRemaining : undefined,
    stockInitial: typeof data.stockInitial === 'number' ? data.stockInitial : undefined,
    soldCount: (data.soldCount as number) ?? 0,
    status: (data.status as ConcessionItemStatus) || 'active',
    sortOrder: (data.sortOrder as number) ?? 0,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
  warnIfInvalidShape(ConcessionItemSchema, 'ConcessionItem', item)
  return item
}

function mapConcessionOrder(id: string, data: Record<string, unknown>): ConcessionOrder {
  const order: ConcessionOrder = {
    id,
    eventId: (data.eventId as string) || '',
    guestId: (data.guestId as string) || '',
    guestNameSnapshot: (data.guestNameSnapshot as string) || '',
    items: (data.items as ConcessionOrderLine[]) || [],
    subtotalMinorUnits: (data.subtotalMinorUnits as number) ?? 0,
    totalMinorUnits: (data.totalMinorUnits as number) ?? 0,
    currency: (data.currency as string) || '',
    itemCount: (data.itemCount as number) ?? 0,
    paymentMethod: (data.paymentMethod as PaymentMethod | null) ?? null,
    paymentPhase: (data.paymentPhase as ConcessionOrder['paymentPhase']) || 'awaiting_payment',
    paymentNote: (data.paymentNote as string) || undefined,
    paymentProofUrl: (data.paymentProofUrl as string) || undefined,
    rejectionReason: (data.rejectionReason as string) || undefined,
    cancelReason: (data.cancelReason as ConcessionCancelReason) || undefined,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    paidAt: data.paidAt ? toMillis(data.paidAt) : undefined,
  }
  warnIfInvalidShape(ConcessionOrderSchema, 'ConcessionOrder', order)
  return order
}

function mapConcessionFulfillment(id: string, data: Record<string, unknown>): ConcessionFulfillment {
  const fulfillment: ConcessionFulfillment = {
    id,
    eventId: (data.eventId as string) || '',
    guestId: (data.guestId as string) || '',
    guestNameSnapshot: (data.guestNameSnapshot as string) || '',
    orderNumber: (data.orderNumber as string) || '',
    lines: (data.lines as ConcessionFulfillmentLine[]) || [],
    fulfillmentStatus: (data.fulfillmentStatus as FulfillmentStatus) || 'not_ready',
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    deliveredAt: data.deliveredAt ? toMillis(data.deliveredAt) : undefined,
  }
  warnIfInvalidShape(ConcessionFulfillmentSchema, 'ConcessionFulfillment', fulfillment)
  return fulfillment
}

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

export interface NewConcessionItemInput {
  name: string
  description?: string
  category: ConcessionsCategory
  imageUrl?: string
  priceMinorUnits: number
  currency: string
  stockMode: 'unlimited' | 'limited'
  stockInitial?: number
  sortOrder: number
}

export async function createConcessionItem(eventId: string, input: NewConcessionItemInput) {
  return measureSpan('firestore.createConcessionItem', 'db.firestore', async () => {
    const ref = doc(collection(db, 'events', eventId, 'concessionsCatalog'))
    await runTransaction(db, async (transaction) => {
      transaction.set(ref, {
        name: input.name,
        description: input.description || '',
        category: input.category,
        imageUrl: input.imageUrl || '',
        priceMinorUnits: input.priceMinorUnits,
        currency: input.currency,
        stockMode: input.stockMode,
        ...(input.stockMode === 'limited'
          ? { stockRemaining: input.stockInitial ?? 0, stockInitial: input.stockInitial ?? 0 }
          : {}),
        soldCount: 0,
        status: 'active',
        sortOrder: input.sortOrder,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })
    return ref.id
  })
}

export async function updateConcessionItem(
  eventId: string,
  itemId: string,
  input: Partial<NewConcessionItemInput>,
) {
  return measureSpan('firestore.updateConcessionItem', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const ref = doc(db, 'events', eventId, 'concessionsCatalog', itemId)
      transaction.update(ref, { ...omitUndefined(input), updatedAt: serverTimestamp() })
    }),
  )
}

// Soft delete — nunca se borra el documento (pedidos históricos guardan un
// snapshot del ítem y deben seguir resolviéndose, ver RFC §4.2/§12 caso 4).
export async function archiveConcessionItem(eventId: string, itemId: string) {
  return measureSpan('firestore.archiveConcessionItem', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const ref = doc(db, 'events', eventId, 'concessionsCatalog', itemId)
      transaction.update(ref, { status: 'archived', updatedAt: serverTimestamp() })
    }),
  )
}

// Único campo que el Menu Manager puede tocar del catálogo (ver
// firestore.rules) — "agotado" manual, independiente del contador de stock
// (ej. se acabó el hielo aunque el sistema diga que quedan sodas).
export async function setConcessionItemAvailability(
  eventId: string,
  itemId: string,
  status: Extract<ConcessionItemStatus, 'active' | 'outOfStock'>,
) {
  return measureSpan('firestore.setConcessionItemAvailability', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const ref = doc(db, 'events', eventId, 'concessionsCatalog', itemId)
      transaction.update(ref, { status, updatedAt: serverTimestamp() })
    }),
  )
}

export function subscribeToConcessionsCatalog(
  eventId: string,
  callback: (items: ConcessionItem[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events', eventId, 'concessionsCatalog'), orderBy('sortOrder', 'asc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapConcessionItem(d.id, d.data()))),
    withListenerReporting('concessions.catalog', onError),
  )
}

// ---------------------------------------------------------------------------
// Checkout — creación transaccional del pedido (reserva de inventario)
// ---------------------------------------------------------------------------

export interface ConcessionCartLine {
  itemId: string
  quantity: number
}

export interface CreateConcessionOrderInput {
  guestId: string
  guestNameSnapshot: string
  // Dispositivo ya reconocido del invitado (ver GuestData.lockTokens) — es la
  // prueba de posesión que exige firestore.rules (isGuestOrderActor), mismo
  // mecanismo que ya usa updateGuestContactSelf para guestContacts.
  lockToken: string | null
  currency: string
  paymentMethod: PaymentMethod | null
  lines: ConcessionCartLine[]
}

// Errores esperables del checkout (a diferencia de un error de red/permiso) —
// el llamador (UI) los usa para mostrar un mensaje puntual y, si corresponde,
// recortar la cantidad del carrito al stock real. `itemId` permite resaltar
// la línea puntual que falló sin tener que parsear el mensaje.
export class ConcessionCheckoutError extends Error {
  readonly itemId?: string

  constructor(message: string, itemId?: string) {
    super(message)
    this.name = 'ConcessionCheckoutError'
    this.itemId = itemId
  }
}

// Único punto de entrada para "pagar" el carrito. Reserva stock (decrementa
// dentro de la MISMA transacción, ver RFC §11.2) y crea el pedido y su
// proyección de cocina a la vez — nunca hay un instante en que exista uno sin
// el otro. El precio y la disponibilidad se leen SIEMPRE del documento
// fresco del catálogo (nunca del carrito local): esto es lo que resuelve de
// raíz "cambio de precio después de agregar al carrito" y "producto
// eliminado/agotado mientras alguien compra" (RFC §12, casos 1, 4 y 9).
export async function createConcessionOrder(eventId: string, input: CreateConcessionOrderInput): Promise<string> {
  if (input.lines.length === 0) throw new ConcessionCheckoutError('El carrito está vacío')

  return measureSpan('firestore.createConcessionOrder', 'db.firestore', async () => {
    const orderRef = doc(collection(db, 'events', eventId, 'concessionsOrders'))
    const fulfillmentRef = doc(db, 'events', eventId, 'concessionsFulfillment', orderRef.id)
    const itemRefs = input.lines.map((line) => doc(db, 'events', eventId, 'concessionsCatalog', line.itemId))
    // Código corto legible, no un contador incremental por evento — un
    // contador compartido sería un documento caliente en una ráfaga de
    // pedidos simultáneos (ver RFC §11.5). doc(collection(...)) ya genera el
    // id localmente, sin red, así que está disponible antes de commitear.
    const orderNumber = orderRef.id.slice(0, 6).toUpperCase()

    await runTransaction(db, async (transaction) => {
      const itemSnaps = await Promise.all(itemRefs.map((ref) => transaction.get(ref)))

      // Una sola pasada de validación + mapeo — evita repetir snap.data() (que
      // TypeScript solo estrecha a "no undefined" dentro del mismo closure
      // donde se llamó exists()) en una segunda pasada separada más abajo.
      const items = itemSnaps.map((snap, i) => {
        const line = input.lines[i]
        if (!snap.exists()) {
          throw new ConcessionCheckoutError('Este producto ya no está disponible', line.itemId)
        }
        const item = mapConcessionItem(snap.id, snap.data())
        if (item.status !== 'active') {
          throw new ConcessionCheckoutError(`"${item.name}" ya no está disponible`, item.id)
        }
        if (item.stockMode === 'limited' && (item.stockRemaining ?? 0) < line.quantity) {
          throw new ConcessionCheckoutError(`Solo quedan ${item.stockRemaining ?? 0} de "${item.name}"`, item.id)
        }
        return item
      })

      const orderLines: ConcessionOrderLine[] = []
      const fulfillmentLines: ConcessionFulfillmentLine[] = []
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

      // Reserva de inventario — dentro de la misma transacción que crea el
      // pedido, así que dos invitados compitiendo por el último producto
      // nunca pueden agotarlo dos veces (Firestore reintenta/serializa
      // transacciones en conflicto sobre el mismo documento).
      items.forEach((item, i) => {
        const quantity = input.lines[i].quantity
        if (item.stockMode !== 'limited') {
          transaction.update(itemRefs[i], { soldCount: increment(quantity), updatedAt: serverTimestamp() })
          return
        }
        const remaining = (item.stockRemaining ?? 0) - quantity
        transaction.update(itemRefs[i], {
          stockRemaining: remaining,
          soldCount: increment(quantity),
          ...(remaining <= 0 ? { status: 'outOfStock' } : {}),
          updatedAt: serverTimestamp(),
        })
      })

      const isFree = subtotalMinorUnits === 0

      transaction.set(orderRef, {
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(isFree ? { paidAt: serverTimestamp() } : {}),
      })

      transaction.set(fulfillmentRef, {
        eventId,
        guestId: input.guestId,
        guestNameSnapshot: input.guestNameSnapshot,
        orderNumber,
        lines: fulfillmentLines,
        fulfillmentStatus: isFree ? 'queued' : 'not_ready',
        lockToken: input.lockToken,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
    })

    return orderRef.id
  })
}

// ---------------------------------------------------------------------------
// Pago — acciones del invitado
// ---------------------------------------------------------------------------

// "Ya pagué / comprobante enviado" (solo transferencia) — mismo criterio que
// submitPaymentProof del pago de entrada, pero acá además viaja la foto del
// comprobante (primera vez que este repo sube una imagen para esto, ver RFC
// §14.3). Idempotente: reintentar sobre un pedido ya en revisión o ya pagado
// es un no-op silencioso, igual que el resto de este archivo.
export async function submitConcessionPaymentProof(
  eventId: string,
  orderId: string,
  input: { note: string; proofUrl: string; lockToken: string | null },
) {
  const trimmedNote = requireMaxLength(requireNonEmpty(input.note, 'El número de referencia'), 300, 'El número de referencia')
  const proofUrl = requireNonEmpty(input.proofUrl, 'El comprobante')
  const orderRef = doc(db, 'events', eventId, 'concessionsOrders', orderId)

  return measureSpan('firestore.submitConcessionPaymentProof', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(orderRef)
      if (!snap.exists()) return
      const order = mapConcessionOrder(snap.id, snap.data())
      if (order.paymentPhase !== 'awaiting_payment' && order.paymentPhase !== 'rejected') return

      transaction.update(orderRef, {
        paymentPhase: 'proof_submitted',
        paymentNote: trimmedNote,
        paymentProofUrl: proofUrl,
        lockToken: input.lockToken,
        updatedAt: serverTimestamp(),
      })
    }),
  )
}

// Autocancelación del propio invitado — solo mientras el pago no esté
// confirmado (RFC §12 caso 7 / matriz de permisos §8.3). Libera el stock
// reservado, igual que cancelConcessionOrder (organizador) más abajo.
// A propósito NO libera stock: a diferencia del descuento del checkout (que
// cualquier invitado sin cuenta puede disparar porque solo puede restar,
// nunca de más), "devolver" stock no tiene ningún techo natural que lo
// autolimite — dejar que un actor anónimo pueda inflarlo lo volvería un
// vector real de sobreventa de un bien físico. firestore.rules exige una
// cuenta de confianza (manageConcessions/confirmPayments/admin) para esa
// escritura puntual (ver isValidConcessionStockRelease) — el stock reservado
// por un pedido que el invitado canceló solo se libera cuando el
// organizador/staff lo cancela a su vez desde su bandeja
// (cancelConcessionOrder más abajo). Mismo criterio ya elegido en el RFC
// §14.1 para pedidos abandonados: sin cronómetros automáticos, un humano de
// confianza decide.
export async function cancelOwnConcessionOrder(
  eventId: string,
  orderId: string,
  lockToken: string | null,
) {
  const orderRef = doc(db, 'events', eventId, 'concessionsOrders', orderId)

  return measureSpan('firestore.cancelOwnConcessionOrder', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(orderRef)
      if (!snap.exists()) return
      const order = mapConcessionOrder(snap.id, snap.data())
      if (order.paymentPhase !== 'awaiting_payment' && order.paymentPhase !== 'rejected') return

      transaction.update(orderRef, {
        paymentPhase: 'cancelled',
        cancelReason: 'guest_cancelled',
        lockToken,
        updatedAt: serverTimestamp(),
      })
    }),
  )
}

// ---------------------------------------------------------------------------
// Pago — acciones del organizador/coanfitrión con confirmPayments o
// manageConcessions (o admin)
// ---------------------------------------------------------------------------

export async function confirmConcessionOrderPayment(eventId: string, orderId: string) {
  const orderRef = doc(db, 'events', eventId, 'concessionsOrders', orderId)
  const fulfillmentRef = doc(db, 'events', eventId, 'concessionsFulfillment', orderId)

  return measureSpan('firestore.confirmConcessionOrderPayment', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const orderSnap = await transaction.get(orderRef)
      if (!orderSnap.exists()) return
      const order = mapConcessionOrder(orderSnap.id, orderSnap.data())
      // Idempotente: aprobar un pedido ya aprobado es un no-op, mismo
      // criterio que setGuestPaymentStatus (evita doble notificación/doble
      // paso a cocina si el organizador hace doble clic).
      if (order.paymentPhase === 'confirmed') return

      transaction.update(orderRef, { paymentPhase: 'confirmed', paidAt: serverTimestamp(), updatedAt: serverTimestamp() })
      transaction.update(fulfillmentRef, { fulfillmentStatus: 'queued', updatedAt: serverTimestamp() })
    }),
  )
}

export async function rejectConcessionOrderPayment(eventId: string, orderId: string, reason: string) {
  const trimmedReason = requireMaxLength(requireNonEmpty(reason, 'El motivo del rechazo'), 300, 'El motivo del rechazo')
  const orderRef = doc(db, 'events', eventId, 'concessionsOrders', orderId)

  return measureSpan('firestore.rejectConcessionOrderPayment', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(orderRef)
      if (!snap.exists()) return
      const order = mapConcessionOrder(snap.id, snap.data())
      if (order.paymentPhase !== 'proof_submitted') return

      transaction.update(orderRef, { paymentPhase: 'rejected', rejectionReason: trimmedReason, updatedAt: serverTimestamp() })
    }),
  )
}

// Cancelación por el organizador — a diferencia de cancelOwnConcessionOrder,
// puede aplicarse en cualquier fase anterior a 'delivered' (incluido un
// pedido ya pagado: reembolso manual fuera de la app, ver RFC §12 caso 6) y
// siempre libera el stock reservado.
export async function cancelConcessionOrder(
  eventId: string,
  orderId: string,
  cancelReason: ConcessionCancelReason,
) {
  const orderRef = doc(db, 'events', eventId, 'concessionsOrders', orderId)
  const fulfillmentRef = doc(db, 'events', eventId, 'concessionsFulfillment', orderId)

  return measureSpan('firestore.cancelConcessionOrder', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const [orderSnap, fulfillmentSnap] = await Promise.all([transaction.get(orderRef), transaction.get(fulfillmentRef)])
      if (!orderSnap.exists()) return
      const order = mapConcessionOrder(orderSnap.id, orderSnap.data())
      if (order.paymentPhase === 'cancelled') return
      if (fulfillmentSnap.exists() && fulfillmentSnap.data().fulfillmentStatus === 'delivered') return

      const itemRefs = order.items.map((line) => doc(db, 'events', eventId, 'concessionsCatalog', line.itemId))
      const itemSnaps = await Promise.all(itemRefs.map((ref) => transaction.get(ref)))
      releaseStock(transaction, itemRefs, itemSnaps, order.items)

      transaction.update(orderRef, { paymentPhase: 'cancelled', cancelReason, updatedAt: serverTimestamp() })
      if (fulfillmentSnap.exists()) {
        transaction.update(fulfillmentRef, { fulfillmentStatus: 'cancelled', updatedAt: serverTimestamp() })
      }
    }),
  )
}

// Compartido por cancelOwnConcessionOrder/cancelConcessionOrder: devuelve al
// catálogo la cantidad reservada por cada línea del pedido. Un ítem ya
// archivado (o borrado en un futuro que no debería pasar, ver
// archiveConcessionItem) no tiene a dónde devolver stock — se ignora esa
// línea en vez de fallar la cancelación entera.
function releaseStock(
  transaction: Transaction,
  itemRefs: DocumentReference[],
  itemSnaps: DocumentSnapshot[],
  lines: ConcessionOrderLine[],
): void {
  itemSnaps.forEach((snap, i) => {
    if (!snap.exists()) return
    const item = mapConcessionItem(snap.id, snap.data())
    if (item.stockMode !== 'limited') return
    const remaining = (item.stockRemaining ?? 0) + lines[i].quantity
    transaction.update(itemRefs[i], {
      stockRemaining: remaining,
      ...(item.status === 'outOfStock' && remaining > 0 ? { status: 'active' } : {}),
      updatedAt: serverTimestamp(),
    })
  })
}

// ---------------------------------------------------------------------------
// Cocina — Menu Manager
// ---------------------------------------------------------------------------

const FULFILLMENT_FORWARD_STEPS: Record<string, FulfillmentStatus> = {
  queued: 'preparing',
  preparing: 'ready',
  ready: 'delivered',
}

// Solo avanza un paso a la vez (queued → preparing → ready → delivered) —
// firestore.rules exige el mismo par (estado actual, estado nuevo) válido,
// esto es la contraparte cliente para no depender de que la UI arme el
// objeto de update a mano en cada botón.
export async function advanceConcessionFulfillment(eventId: string, orderId: string) {
  const ref = doc(db, 'events', eventId, 'concessionsFulfillment', orderId)
  return measureSpan('firestore.advanceConcessionFulfillment', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) return
      const current = (snap.data().fulfillmentStatus as FulfillmentStatus) || 'not_ready'
      const next = FULFILLMENT_FORWARD_STEPS[current]
      if (!next) return
      transaction.update(ref, {
        fulfillmentStatus: next,
        updatedAt: serverTimestamp(),
        ...(next === 'delivered' ? { deliveredAt: serverTimestamp() } : {}),
      })
    }),
  )
}

const FULFILLMENT_BACKWARD_STEPS: Record<string, FulfillmentStatus> = {
  preparing: 'queued',
  ready: 'preparing',
  // Sin entrada para 'delivered': firestore.rules no permite al Menu
  // Manager tocar un pedido ya entregado (ver `allow update` de
  // concessionsFulfillment) — "deshacer" una entrega ya hecha queda
  // reservado al organizador/admin (fuera del alcance de esta pantalla).
}

// "Deshacer un paso" (ver RFC §2.3, wireframe del encargado) — mismo
// criterio que advanceConcessionFulfillment: firestore.rules ya permite
// cualquier par (actual, destino) dentro del set del Menu Manager, esto
// solo evita que la UI arme el objeto de update a mano en cada botón.
export async function revertConcessionFulfillment(eventId: string, orderId: string) {
  const ref = doc(db, 'events', eventId, 'concessionsFulfillment', orderId)
  return measureSpan('firestore.revertConcessionFulfillment', 'db.firestore', () =>
    runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref)
      if (!snap.exists()) return
      const current = (snap.data().fulfillmentStatus as FulfillmentStatus) || 'not_ready'
      const previous = FULFILLMENT_BACKWARD_STEPS[current]
      if (!previous) return
      transaction.update(ref, { fulfillmentStatus: previous, updatedAt: serverTimestamp() })
    }),
  )
}

export function subscribeToConcessionFulfillmentQueue(
  eventId: string,
  callback: (orders: ConcessionFulfillment[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'concessionsFulfillment'),
    where('fulfillmentStatus', 'in', ['queued', 'preparing', 'ready']),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapConcessionFulfillment(d.id, d.data()))),
    withListenerReporting('concessions.fulfillmentQueue', onError),
  )
}

// ---------------------------------------------------------------------------
// Organizador — bandeja de pedidos (pago) e invitado — "mis pedidos"
// ---------------------------------------------------------------------------

export function subscribeToConcessionOrdersPendingPayment(
  eventId: string,
  callback: (orders: ConcessionOrder[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'concessionsOrders'),
    where('paymentPhase', 'in', ['awaiting_payment', 'proof_submitted']),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapConcessionOrder(d.id, d.data()))),
    withListenerReporting('concessions.ordersPendingPayment', onError),
  )
}

// Un pedido puntual, por id ya conocido — es como el invitado sigue el
// estado de SU pedido en tiempo real (bearer-link, mismo modelo de confianza
// que guests/{guestId}, ver firestore.rules). El id se persiste del lado del
// cliente al hacer checkout (createConcessionOrder ya lo devuelve); no hace
// falta ninguna query de colección para este caso de uso, ver RFC §12 caso
// 11 sobre por qué "mis pedidos" es deliberadamente por dispositivo.
export function subscribeToConcessionOrder(
  eventId: string,
  orderId: string,
  callback: (order: ConcessionOrder | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'events', eventId, 'concessionsOrders', orderId),
    (snap) => callback(snap.exists() ? mapConcessionOrder(snap.id, snap.data()) : null),
    withListenerReporting('concessions.order', onError),
  )
}

// Mismo id que el ConcessionOrder del que es proyección (ver mapConcessionFulfillment).
// El invitado dueño del pedido SÍ puede leer este documento (bearer-link,
// igual que el propio pedido — ver firestore.rules, `!isConcessionsStaff`)
// pese a no tener ningún permiso de organizador: es lo que le permite a
// "Mi pedido" (Fase 2, GuestPass) mostrar preparing/ready/delivered además
// de la fase de pago, sin exponerle nunca al Menu Manager nada de esto al
// revés (esa dirección la bloquean las mismas rules).
export function subscribeToConcessionFulfillment(
  eventId: string,
  orderId: string,
  callback: (fulfillment: ConcessionFulfillment | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'events', eventId, 'concessionsFulfillment', orderId),
    (snap) => callback(snap.exists() ? mapConcessionFulfillment(snap.id, snap.data()) : null),
    withListenerReporting('concessions.guestFulfillment', onError),
  )
}

// ---------------------------------------------------------------------------
// Configuración del módulo y staff (Fase 1 — panel de organizador)
// ---------------------------------------------------------------------------

export type NewConcessionsSettingsInput = Omit<ConcessionsConfig, 'enabled' | 'concessionsStaffMap'>

// Los formularios de este módulo usan `campo.trim() || undefined` para
// representar "el organizador lo dejó vacío" (ej. storeName, paymentInstructions,
// pickupInstructions, description, imageUrl). Firestore acepta perfectamente
// que una CLAVE esté ausente, pero rechaza de plano cualquier escritura que
// contenga una clave presente con valor `undefined` explícito ("Unsupported
// field value: undefined") — y como esa excepción la atrapa cada caller con
// un `catch { setError(...) }` que solo pinta un mensaje en pantalla (nunca
// un console.error), el fallo real quedaba invisible en la consola del
// navegador. Este helper limpia esos `undefined` antes de que lleguen a
// cualquier escritura — nunca se usa en los mappers (lectura), donde
// `undefined` es un valor JS normal que jamás vuelve a Firestore.
function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

// Activar el módulo — SOLO tiene efecto real si quien llama es un admin de
// PaseLink (ver concessionsEnableChangeIsAllowed en firestore.rules): el
// resto de esta función no valida eso del lado cliente a propósito, la
// autorización real vive en las rules. Escribe el objeto `concessions`
// completo de una sola vez (en vez de un dot-path a `enabled`) para que el
// evento quede con una config válida desde el primer momento — nunca un
// `enabled: true` sin storeName/paymentMethods/etc.
export async function enableConcessionsBeta(eventId: string, settings: NewConcessionsSettingsInput) {
  return measureSpan('firestore.enableConcessionsBeta', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), {
      concessions: { ...omitUndefined(settings), enabled: true, concessionsStaffMap: {} },
      updatedAt: serverTimestamp(),
    }),
  )
}

// Cualquier dueño/coanfitrión con manageConcessions (o admin) puede
// desactivarlo — apagar el módulo nunca requiere ser admin, ver
// concessionsEnableChangeIsAllowed.
export async function disableConcessions(eventId: string) {
  return measureSpan('firestore.disableConcessions', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), {
      'concessions.enabled': false,
      updatedAt: serverTimestamp(),
    }),
  )
}

// Nunca toca `enabled` ni `concessionsStaffMap` — separado a propósito de
// enableConcessionsBeta/addConcessionsStaff/removeConcessionsStaff para que
// cada acción de la UI (activar, invitar staff, guardar config) sea una
// escritura angosta y fácil de auditar.
export async function updateConcessionsSettings(eventId: string, patch: Partial<NewConcessionsSettingsInput>) {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() }
  for (const [key, value] of Object.entries(omitUndefined(patch))) {
    updates[`concessions.${key}`] = value
  }
  return measureSpan('firestore.updateConcessionsSettings', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), updates),
  )
}

// Mismo patrón que addCoOrganizer/removeCoOrganizer (events.ts) pero con un
// solo mapa (uid → email, solo para mostrarlo en el panel — la autorización
// real en firestore.rules es por presencia de la clave, no por su valor),
// sin permisos granulares — el Menu Manager no es un coorganizador, ver RFC
// §8.2.
export async function addConcessionsStaff(eventId: string, uid: string, email: string) {
  return measureSpan('firestore.addConcessionsStaff', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), {
      [`concessions.concessionsStaffMap.${uid}`]: email,
      updatedAt: serverTimestamp(),
    }),
  )
}

export async function removeConcessionsStaff(eventId: string, uid: string) {
  return measureSpan('firestore.removeConcessionsStaff', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), {
      [`concessions.concessionsStaffMap.${uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  )
}
