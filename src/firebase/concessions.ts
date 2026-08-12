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
  count,
  deleteField,
  doc,
  documentId,
  getAggregateFromServer,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  startAfter,
  sum,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore'
import { httpsCallable, FunctionsError } from 'firebase/functions'
import { db, functions } from './config'
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

// Único punto de entrada para "pagar" el carrito — vía la Callable Function
// `createConcessionOrder` (functions/src/callable/createConcessionOrder.ts,
// ver FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase B). El precio y la
// disponibilidad se leen SIEMPRE del documento fresco del catálogo (nunca de
// nada que mande el cliente) dentro de una transacción con Admin SDK — ahora
// nadie que hable directo contra Firestore puede fabricar un total que no
// coincida con el catálogo real (el gap que antes solo el cliente honesto
// evitaba, sin que firestore.rules pudiera volver a verificarlo).
export async function createConcessionOrder(eventId: string, input: CreateConcessionOrderInput): Promise<string> {
  if (input.lines.length === 0) throw new ConcessionCheckoutError('El carrito está vacío')

  return measureSpan('firestore.createConcessionOrder', 'db.firestore', async () => {
    const callable = httpsCallable<
      { eventId: string } & CreateConcessionOrderInput,
      { status: 'success'; orderId: string }
    >(functions, 'createConcessionOrder')

    try {
      const result = await callable({ eventId, ...input })
      return result.data.orderId
    } catch (err) {
      // La Callable manda `itemId` en `details` únicamente para los errores
      // de negocio del checkout (stock/catálogo) — todo lo demás (evento
      // inexistente, módulo apagado, lockToken ajeno) se deja propagar tal
      // cual, el llamador ya lo trata como error genérico.
      if (
        err instanceof FunctionsError &&
        err.details && typeof err.details === 'object' && 'itemId' in err.details
      ) {
        throw new ConcessionCheckoutError(err.message, (err.details as { itemId?: string }).itemId)
      }
      throw err
    }
  })
}

// ---------------------------------------------------------------------------
// Pago — acciones del invitado
// ---------------------------------------------------------------------------

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

// Cancelación por el organizador — vía la Callable Function
// `cancelConcessionOrder` (functions/src/callable/cancelConcessionOrder.ts,
// ver FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase B). A diferencia de
// cancelOwnConcessionOrder, puede aplicarse en cualquier fase anterior a
// 'delivered' (incluido un pedido ya pagado: reembolso manual fuera de la
// app, ver RFC §12 caso 6) y siempre libera el stock reservado.
export async function cancelConcessionOrder(
  eventId: string,
  orderId: string,
  cancelReason: ConcessionCancelReason,
): Promise<void> {
  return measureSpan('firestore.cancelConcessionOrder', 'db.firestore', async () => {
    const callable = httpsCallable<{ eventId: string; orderId: string; cancelReason: ConcessionCancelReason }, { ok: boolean }>(
      functions, 'cancelConcessionOrder',
    )
    await callable({ eventId, orderId, cancelReason })
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
// igual que el propio pedido — ver firestore.rules, `!isConcessionsStaffMember`)
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
      // '$' de respaldo: firestore.rules exige `currency.size() > 0` en
      // cada producto del catálogo (isValidConcessionItem) — un evento sin
      // moneda configurada (EventData.currency vacío) dejaría
      // `concessions.currency: ''` guardado, y CUALQUIER alta de producto
      // se rechazaría después con "Missing or insufficient permissions"
      // sin ninguna pista de por qué (bug real encontrado en vivo,
      // 2026-07-31) — mismo respaldo que ya aplica el formulario, repetido
      // acá para que ningún otro caller pueda reintroducirlo.
      concessions: { ...omitUndefined(settings), currency: settings.currency || '$', enabled: true, concessionsStaffMap: {} },
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
// enableConcessionsBeta/removeConcessionsStaff (y de las Cloud Functions de
// invitación de encargados) para que cada acción de la UI (activar, invitar
// staff, guardar config) sea una escritura angosta y fácil de auditar.
export async function updateConcessionsSettings(eventId: string, patch: Partial<NewConcessionsSettingsInput>) {
  const updates: Record<string, unknown> = { updatedAt: serverTimestamp() }
  // Mismo respaldo que enableConcessionsBeta — nunca guardar `currency`
  // vacío, ver el comentario ahí.
  const cleanPatch = omitUndefined(patch)
  if ('currency' in cleanPatch && !cleanPatch.currency) {
    cleanPatch.currency = '$'
  }
  for (const [key, value] of Object.entries(cleanPatch)) {
    updates[`concessions.${key}`] = value
  }
  return measureSpan('firestore.updateConcessionsSettings', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), updates),
  )
}

// El alta ahora es siempre por invitación con enlace (ver
// createConcessionsStaffInvite/acceptConcessionsStaffInvite, Cloud
// Functions) — quitar sigue siendo una escritura angosta del cliente, mismo
// criterio que removeCoOrganizer (events.ts): borra la entrada completa
// (ambos roles) del mapa, sin permisos granulares por rol.
export async function removeConcessionsStaff(eventId: string, uid: string) {
  return measureSpan('firestore.removeConcessionsStaff', 'db.firestore', () =>
    updateDoc(doc(db, 'events', eventId), {
      [`concessions.concessionsStaffMap.${uid}`]: deleteField(),
      updatedAt: serverTimestamp(),
    }),
  )
}

// ---------------------------------------------------------------------------
// Historial de ventas — solo pedidos con `paymentPhase == 'confirmed'`
// (pagados de verdad, sin importar si ya se entregaron): quedan afuera
// cancelados/rechazados/abandonados, ver §20-23 del rediseño "Ventas del
// evento". El precio/nombre de cada línea viene del snapshot congelado en
// el pedido (`unitPriceMinorUnitsSnapshot`/`nameSnapshot`), nunca del
// catálogo actual — así el organizador puede cambiar precios después sin
// que eso reescriba ventas ya hechas.
// ---------------------------------------------------------------------------

export interface ConcessionsSalesSummary {
  totalMinorUnits: number
  orderCount: number
}

// UNA sola lectura agregada server-side (sum+count en la misma llamada) en
// vez de traer todos los pedidos confirmados a memoria solo para sumarlos —
// mismo criterio que getPlatformUsageStats (platformUsage.ts). A diferencia
// de un `count()` puro, `sum()` SÍ exige un índice compuesto sobre
// (paymentPhase, totalMinorUnits) aunque el filtro sea una simple igualdad
// (comprobado en vivo: Firestore rechaza la agregación con
// `failed-precondition` sin ese índice) — ver firestore.indexes.json.
export async function getConcessionsSalesSummary(eventId: string): Promise<ConcessionsSalesSummary> {
  const q = query(collection(db, 'events', eventId, 'concessionsOrders'), where('paymentPhase', '==', 'confirmed'))
  const snap = await measureSpan('firestore.getConcessionsSalesSummary', 'db.firestore', () =>
    getAggregateFromServer(q, { total: sum('totalMinorUnits'), orders: count() }),
  )
  return { totalMinorUnits: snap.data().total, orderCount: snap.data().orders }
}

// 25 (no 30, el máximo real de una cláusula `in`) para que la página de
// pedidos y la consulta de sus estados de entrega (una sola `in` sobre
// documentId(), ver abajo) siempre entren en una sola llamada cada una, sin
// necesitar chunking como fetchContactsByIds (guests.ts).
const SALES_HISTORY_PAGE_SIZE = 25

export interface ConcessionsSalesHistoryPage {
  orders: ConcessionOrder[]
  fulfillmentByOrderId: Record<string, FulfillmentStatus>
  cursor: QueryDocumentSnapshot | null
}

// Paginado con `getDocs` (no listener): es historial, no necesita tiempo
// real, y una lista potencialmente larga de ventas no debería mantener un
// listener activo indefinidamente solo para mostrarse una vez. Ordenado por
// `paidAt` (momento real del pago, no `createdAt`) — más relevante para un
// historial de ventas que "cuándo se creó el pedido". El estado de entrega
// (`concessionsFulfillment`, mismo id que el pedido) se trae aparte en una
// sola consulta `documentId() in [...]` — nunca se guarda en
// `concessionsOrders`, que es la colección sin conocimiento de preparación
// (ver la separación pago/preparación documentada en ConcessionOrder).
export async function getConcessionsSalesHistoryPage(
  eventId: string,
  cursor: QueryDocumentSnapshot | null = null,
): Promise<ConcessionsSalesHistoryPage> {
  const constraints = [
    where('paymentPhase', '==', 'confirmed'),
    orderBy('paidAt', 'desc'),
    ...(cursor ? [startAfter(cursor)] : []),
    limit(SALES_HISTORY_PAGE_SIZE),
  ]
  const q = query(collection(db, 'events', eventId, 'concessionsOrders'), ...constraints)
  const snap = await measureSpan('firestore.getConcessionsSalesHistoryPage', 'db.firestore', () => getDocs(q))
  const orders = snap.docs.map((d) => mapConcessionOrder(d.id, d.data()))

  const fulfillmentByOrderId: Record<string, FulfillmentStatus> = {}
  if (orders.length > 0) {
    const fulfillmentSnap = await getDocs(
      query(collection(db, 'events', eventId, 'concessionsFulfillment'), where(documentId(), 'in', orders.map((o) => o.id))),
    )
    fulfillmentSnap.docs.forEach((d) => {
      fulfillmentByOrderId[d.id] = (d.data().fulfillmentStatus as FulfillmentStatus) || 'not_ready'
    })
  }

  return {
    orders,
    fulfillmentByOrderId,
    cursor: snap.docs.length === SALES_HISTORY_PAGE_SIZE ? snap.docs[snap.docs.length - 1] : null,
  }
}
