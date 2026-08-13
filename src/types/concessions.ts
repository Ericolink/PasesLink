import type { PaymentMethod } from './index'

// Módulo de venta de alimentos/bebidas/souvenirs durante el evento. Namespace
// deliberadamente distinto de `menu` (EventData.menu ya existe y significa
// selección de plato del RSVP/banquete, un concepto distinto) — ver
// FOOD_BEVERAGE_ORDERING_ARCHITECTURE.md §1. De cara al organizador/invitado
// la sección se llama "Ventas del evento" (antes "Menú" — cambiado porque no
// todo lo que se vende acá es comida); en código siempre es `concessions`.
export type ConcessionsCategory = 'drink' | 'food' | 'snack' | 'souvenir' | 'special'

export const CONCESSIONS_CATEGORY_LABELS: Record<ConcessionsCategory, string> = {
  drink: 'Bebidas',
  food: 'Comida',
  snack: 'Snacks',
  souvenir: 'Souvenirs',
  special: 'Especiales',
}

// Config del módulo, campo opcional/aditivo en EventData (ver ese archivo).
// `enabled` es el gate de beta: mientras dure, solo un admin de PaseLink
// puede escribirlo a `true` (ver firestore.rules,
// concessionsEnableChangeIsAllowed) — pasar a GA es relajar esa condición
// ahí, sin tocar este tipo ni migrar datos.
export interface ConcessionsConfig {
  enabled: boolean
  storeName?: string
  currency: string
  // Subconjunto de PaymentMethod habilitado para este módulo — puede diferir
  // de EventData.paymentMethods (ej. el evento solo acepta transferencia para
  // la entrada, pero el organizador quiere aceptar efectivo también en la
  // barra).
  paymentMethods: PaymentMethod[]
  // true (default recomendado) = se muestra EventData.paymentInstructions tal
  // cual, sin duplicar el campo. false = se usa `paymentInstructions` de acá,
  // exclusivo del módulo — ver §6 del RFC.
  useEventPaymentInstructions: boolean
  paymentInstructions?: string
  pickupInstructions?: string
  // uid → encargado, mismo patrón que EventData.coOrganizersMap (el email es
  // solo para mostrarlo en el panel de administración, `firestore.rules`
  // autoriza por presencia de la clave y por rol dentro de ella, nunca por el
  // valor del email). El encargado NO es un coorganizador (ver §8.2 del RFC):
  // es un rol aparte, sin acceso a guests/reportes/configuración del evento.
  // Shape legado (string = solo el email) convive con el shape nuevo — ver
  // `resolveConcessionsStaffEntry`. Nunca se vuelve a escribir en shape
  // legado, solo se sigue leyendo por compatibilidad con encargados dados de
  // alta antes de la invitación por enlace: esos encargados legado se
  // resuelven como solo-preparación, el único acceso que ya tenían en la
  // práctica.
  concessionsStaffMap?: Record<string, ConcessionsStaffEntry | string>
}

export interface ConcessionsStaffRoles {
  cashier: boolean
  prep: boolean
}

export interface ConcessionsStaffEntry {
  email: string
  roles: ConcessionsStaffRoles
}

// Único lugar que sabe interpretar el shape legado — usado por
// ConcessionStaffPanel.tsx y resolveCollaboratorPermissions
// (collaboratorPermissions.ts), y puerteado a functions/src/lib/permissions.ts
// (no se puede importar src/ desde functions/, mismo motivo documentado en
// ese archivo).
export function resolveConcessionsStaffEntry(raw: ConcessionsStaffEntry | string | undefined): ConcessionsStaffEntry | null {
  if (raw == null) return null
  if (typeof raw === 'string') return { email: raw, roles: { cashier: false, prep: true } }
  return raw
}

// Completitud mínima para desbloquear Catálogo/Pedidos/Historial — no exige
// tener productos cargados (evitaría poder crear el primero). Ver
// ConcessionsManager.tsx: mientras esto sea false se muestra el onboarding
// guiado en vez de las pestañas.
export function isConcessionsSetupComplete(config: ConcessionsConfig | undefined): boolean {
  if (!config?.enabled) return false
  if (!config.currency?.trim()) return false
  if (!config.paymentMethods || config.paymentMethods.length === 0) return false
  if (!config.useEventPaymentInstructions && !config.paymentInstructions?.trim()) return false
  return true
}

export type ConcessionItemStatus = 'active' | 'outOfStock' | 'archived'

export interface ConcessionItem {
  id: string
  name: string
  description?: string
  category: ConcessionsCategory
  imageUrl?: string
  // Enteros, nunca float (mismo criterio que amountDueMinorUnits en
  // PLATFORM_EXPANSION_ARCHITECTURE.md §4.3) — 0 = gratis.
  priceMinorUnits: number
  currency: string
  stockMode: 'unlimited' | 'limited'
  // Solo tiene sentido si stockMode === 'limited'.
  stockRemaining?: number
  stockInitial?: number
  // Denormalizado, incrementado en la misma transacción que crea un pedido.
  soldCount: number
  // Máquina de 3 estados, no un booleano — ver comentario en el RFC §4.2:
  // 'outOfStock' puede llegar automático (stockRemaining llega a 0) o manual
  // (Menu Manager). 'archived' es el único "borrado" posible — nunca se hace
  // delete real del documento porque pedidos históricos guardan un snapshot
  // del ítem y necesitan poder seguir resolviéndose.
  status: ConcessionItemStatus
  sortOrder: number
  createdAt: number
  updatedAt: number
}

export interface ConcessionOrderLine {
  itemId: string
  // Copias INMUTABLES al momento de comprar — nunca se recalculan si el
  // ítem cambia de nombre/precio/categoría después (ver RFC §11.2: el precio
  // se resuelve del documento fresco en la transacción de checkout, no del
  // carrito local, pero una vez escrito en el pedido queda congelado).
  nameSnapshot: string
  categorySnapshot: ConcessionsCategory
  unitPriceMinorUnitsSnapshot: number
  quantity: number
  lineTotalMinorUnits: number
}

// Máquina de estados de PAGO (vive en concessionsOrders, nunca en
// concessionsFulfillment) — ver RFC §5 para el mapeo completo contra el
// flujo lineal que ve el invitado.
export type ConcessionPaymentPhase =
  | 'awaiting_payment'
  | 'proof_submitted'
  | 'confirmed'
  | 'rejected'
  | 'cancelled'

export type ConcessionCancelReason =
  | 'guest_cancelled'
  | 'organizer_cancelled'
  | 'refunded'
  | 'item_removed'
  | 'guest_removed_from_event'
  | 'event_cancelled'

// Documento fuente de verdad — dinero, comprobante, nota. Solo lo leen dueño/
// coorganizador con manageConcessions o confirmPayments/admin, y el propio
// invitado dueño del pedido (bearer-link, mismo modelo de confianza que
// guests/{guestId}). El Menu Manager NUNCA tiene permiso sobre esta colección
// — ver ConcessionFulfillment más abajo para lo que sí puede leer/tocar.
export interface ConcessionOrder {
  id: string
  eventId: string
  guestId: string
  guestNameSnapshot: string
  items: ConcessionOrderLine[]
  subtotalMinorUnits: number
  totalMinorUnits: number
  currency: string
  itemCount: number
  // null solo si totalMinorUnits === 0 (pedido 100% gratis).
  paymentMethod: PaymentMethod | null
  paymentPhase: ConcessionPaymentPhase
  paymentNote?: string
  paymentProofUrl?: string
  rejectionReason?: string
  cancelReason?: ConcessionCancelReason
  createdAt: number
  updatedAt: number
  paidAt?: number
  // Presente SOLO en el request de create/update, nunca leído después — es
  // la prueba de que quien escribe controla el dispositivo reconocido del
  // invitado dueño (ver isGuestOrderActor en firestore.rules), mismo truco
  // que ya usa guestContacts para probar posesión en un documento hermano.
  // Se persiste igual que ahí (Firestore Rules no puede "descartar" un campo
  // después de validarlo), pero ningún código de la app vuelve a leerlo.
  lockToken?: string
}

// Estado de PREPARACIÓN — vive en concessionsFulfillment, con el MISMO id que
// el ConcessionOrder del que es proyección (mismo patrón que
// guests/guestContacts). 'not_ready' es el único estado que el Menu Manager
// no puede leer (ver firestore.rules) — así la restricción "no ve pedidos sin
// pagar" es real, no solo de UI.
export type FulfillmentStatus = 'not_ready' | 'queued' | 'preparing' | 'ready' | 'delivered' | 'cancelled'

// Copia sin dinero de cada línea — el Menu Manager necesita saber QUÉ
// preparar, nunca cuánto costó.
export interface ConcessionFulfillmentLine {
  nameSnapshot: string
  categorySnapshot: ConcessionsCategory
  quantity: number
}

export interface ConcessionFulfillment {
  id: string // == ConcessionOrder.id
  eventId: string
  // No se usa para mostrar nada al Menu Manager (que nunca ve datos del
  // invitado más allá de su nombre) — existe solo para que firestore.rules
  // pueda autorizar la creación de este documento vía isGuestOrderActor,
  // igual motivo que ConcessionOrder.guestId.
  guestId: string
  guestNameSnapshot: string
  // Código corto legible (no correlativo global) — ver RFC §12.4/§11.5: un
  // contador incremental por evento sería un documento caliente en una
  // ráfaga de pedidos simultáneos.
  orderNumber: string
  lines: ConcessionFulfillmentLine[]
  fulfillmentStatus: FulfillmentStatus
  createdAt: number
  updatedAt: number
  deliveredAt?: number
  // Ver el mismo campo en ConcessionOrder — solo existe en el request de
  // create, prueba de posesión, no lo vuelve a leer nadie.
  lockToken?: string
}

export const CONCESSION_PAYMENT_PHASE_LABELS: Record<ConcessionPaymentPhase, string> = {
  awaiting_payment: 'Pendiente de pago',
  proof_submitted: 'Comprobante enviado',
  confirmed: 'Pago confirmado',
  rejected: 'Comprobante rechazado',
  cancelled: 'Cancelado',
}

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  not_ready: 'Esperando confirmación de pago',
  queued: 'Pendiente de preparar',
  preparing: 'Preparando',
  ready: 'Listo',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
}
