import type { CoOrganizerPermissions } from './coOrganizerPermissions'

// Por ahora solo existe 'premium' (gratis durante el lanzamiento). Se deja como
// union (no un literal suelto) para poder reintroducir un tier de pago después
// sin tocar el resto del código, que ya está escrito en términos de `Plan`.
export type Plan = 'premium'

export type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export type EntryMode = 'list' | 'open' | 'hybrid'

// Ciclo de vida del pago de un invitado. Deliberadamente el ÚNICO campo que
// responde "¿está pagado?" — independiente de si el invitado cuenta para el
// cupo (el registro nunca se bloquea ni se libera por pago, ver
// EventData.capacity/paidCount).
// - 'unpaid': sin pago confirmado. Sin límite de tiempo — un invitado puede
//   subir su comprobante o esperar a pagar en efectivo el día del evento
//   cuando quiera, no hay cronómetro ni vencimiento.
// - 'pending_confirmation': el invitado marcó "ya pagué / comprobante
//   enviado" (solo transferencia) — espera que el organizador apruebe o
//   rechace. Un rechazo lo vuelve a 'unpaid' (nunca a 'expired'). Pensado
//   para que el día que exista una pasarela de pago real, este estado lo
//   resuelva un webhook en segundos en vez de un organizador a mano — la
//   máquina de estados no cambia, solo quién la dispara.
// - 'paid': pago confirmado por el organizador (o, a futuro, la pasarela).
//   Es la ÚNICA transición que mueve EventData.paidCount — nunca al solo
//   enviar comprobante.
// - 'expired': valor LEGACY, de antes de eliminar el "apartado temporal de
//   lugar" (holdExpiresAt + un barrido periódico que lo vencía solo). El
//   código actual nunca vuelve a escribir este valor, pero puede seguir
//   apareciendo en documentos ya guardados en producción — no se migran a
//   mano. Toda la UI/lógica debe tratarlo como equivalente a 'unpaid'
//   (comparar con `!== 'paid' && !== 'pending_confirmation'`, no enumerar
//   los 3 valores "no pagados" a mano).
export type GuestPaymentStatus = 'unpaid' | 'pending_confirmation' | 'paid' | 'expired'

// Formas de cobro que un organizador puede activar para un evento con costo
// (EventCreate/EditEventForm). Un evento puede ofrecer una sola o ambas a la
// vez — ver `paymentMethods` en EventData.
export type PaymentMethod = 'transfer' | 'cash'

export type CustomFieldType = 'text' | 'number' | 'email' | 'phone'

// Unión cerrada (no string suelto) para que agregar una plantilla nueva sea
// un error de tipos hasta que también se agregue su entrada en
// src/templates/registry.ts — evita plantillas "fantasma" referenciadas desde
// un evento pero sin definición visual.
export type TemplateId =
  | 'default'
  | 'wedding'
  | 'cowboy'
  | 'graduation'
  | 'formal'
  | 'kids'
  | 'houseparty'

export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
}

export interface TimelineEntry {
  time: string   // 'HH:MM' (formato 24h, igual que startTime/endTime)
  label: string
}

export interface EventData {
  id: string
  ownerId: string
  name: string
  date: string
  startTime?: string // 'HH:MM', opcional
  endTime?: string   // 'HH:MM', opcional
  location: string
  description?: string
  dressCode?: string
  coverImage?: string
  accentColor?: string
  templateId?: TemplateId
  welcomeMessage?: string
  mapsUrl?: string
  entryMode: EntryMode
  capacity: number
  // Tope de acompañantes que puede sumar UN invitado individual (autoregistro
  // público o alta/edición manual del organizador) — ver GUEST_MAX_COMPANIONS
  // en utils/validation.ts (techo 20) y resolveMaxCompanions en
  // firebase/guests.ts (única fuente de verdad del valor efectivo). Ausente
  // en eventos de antes de este campo: se resuelve a 0 (sin acompañantes),
  // no a "sin límite" — pedido explícito para no dejar overselling
  // silencioso en eventos ya creados. NO aplica a invitados `isGroup: true`
  // ("familia o grupo"), que sigue gobernado por su propio tope
  // GUEST_GROUP_MAX_MEMBERS — es una herramienta de alta masiva distinta, ya
  // confiada al organizador.
  maxCompanions?: number
  customFields?: CustomField[]
  requiresPayment: boolean
  // Métodos de cobro activos cuando requiresPayment es true — puede incluir
  // uno u otro, o ambos a la vez (EventCreate/EditEventForm). Vacío si el
  // evento no cobra entrada. `paymentInstructions` abajo solo aplica a
  // 'transfer' (datos bancarios/alias); 'cash' no necesita instrucciones,
  // se cobra presencialmente y el organizador lo marca a mano.
  paymentMethods: PaymentMethod[]
  ticketPrice: number
  currency: string
  paymentInstructions: string
  // Teléfono del organizador (o de quien gestione los pagos) en formato
  // internacional para el link de WhatsApp (wa.me) que ve el invitado en su
  // pase cuando el evento cobra entrada — enviar comprobante, resolver
  // dudas, pedir devolución o reportar un problema de acceso, todo por el
  // mismo canal. Opcional: si está vacío, ese apartado no se muestra.
  organizerContactPhone?: string
  timeline?: TimelineEntry[]
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  // Cantidad de invitaciones/documentos `guests` (1 por invitado o por
  // familia/grupo, sin importar cuántas personas represente cada uno).
  guestCount: number
  // Cantidad total de PERSONAS esperadas: suma de partySize() (1 +
  // companions.length) de cada invitado/familia — a diferencia de
  // guestCount, que cuenta invitaciones, no personas. Existe como contador
  // denormalizado (no derivado en el cliente) para que las vistas que
  // listan varios eventos sin cargar su subcolección `guests` (Dashboard)
  // puedan calcular "% de asistencia" correctamente: dividir
  // checkedInCount (personas) entre guestCount (invitaciones) da porcentajes
  // incorrectos en cuanto un invitado tiene acompañantes o es una familia de
  // varios integrantes. EventDetail, que sí carga `guests`, sigue usando
  // totalPeople (useGuestStats) en vez de este campo — ambos deben coincidir.
  peopleCount: number
  // Asistencia acumulada (cuánta gente hizo check-in alguna vez) — nunca se
  // decrementa por una salida individual. Para "cuánta gente hay adentro
  // ahora mismo" usar `occupancyCount` (o `useGuestStats.peopleInside` para
  // el subconjunto de invitados con pase, sin walk-ins anónimos).
  checkedInCount: number
  // Ocupación en vivo: sube con cualquier ingreso (check-in, reingreso o
  // walk-in anónimo) y baja con cualquier salida (temporal, definitiva o
  // walkOut) — es la única fuente de verdad para gatear `capacity` contra
  // cuánta gente hay físicamente adentro. Separado de `checkedInCount` a
  // propósito: ese campo alimenta estadísticas de asistencia acumulada
  // (EventDetail, Reports, la barra de progreso del Scanner) que no deben
  // fluctuar hacia abajo cuando alguien sale y vuelve.
  occupancyCount: number
  // Personas con pago aprobado (partySize(), no invitaciones) — sube SOLO al
  // aprobar (nunca al enviar comprobante), baja si se revierte el pago o se
  // borra un invitado que ya estaba pagado (ver setGuestPaymentStatus/
  // deleteGuest/updateGuest en src/firebase/guests.ts). No aplica a eventos
  // gratuitos (requiresPayment: false) — la UI no debe mostrarlo ahí.
  // Eventos creados antes de este campo caen a 0 (ver mapEvent) — correr
  // scripts/backfill-paid-count.mjs una vez si hace falta reflejar pagos ya
  // aprobados antes de este cambio.
  paidCount: number
  coOrganizersMap?: Record<string, string>  // { [uid]: email }
  // Permisos granulares por co-organizador (ver src/types/coOrganizerPermissions.ts).
  // Opcional y aditivo: un co-organizador sin entrada acá (evento/co-org de
  // antes de este campo) cae a LEGACY_COORG_DEFAULTS vía resolveEventPermissions,
  // nunca requiere backfill.
  coOrganizerPermissions?: Record<string, CoOrganizerPermissions>
  createdAt: number
  updatedAt: number
}

export type WallMessageType = 'comment' | 'question' | 'music' | 'idea'

// Set cerrado por ahora (agregar una reacción nueva = un entry acá + en
// REACTIONS en ReactionPicker.tsx, nada más — el resto del sistema
// (contadores, "más usadas", picker) ya itera sobre lo que exista en
// `reactions` sin asumir cuáles tipos hay).
export type ReactionType = 'like' | 'love' | 'haha' | 'wow' | 'sad' | 'angry'

export interface WallReaction {
  type: ReactionType
  // Denormalizado (igual que authorName en el mensaje) para poder mostrar
  // "quién reaccionó" sin una consulta extra por reacción.
  name: string
  // Ambos opcionales y agregados después de que reactions ya tenía datos en
  // producción — reacciones viejas no los tienen, y la UI (ReactionListSheet)
  // cae a un fallback (iniciales / orden alfabético) en vez de asumir que
  // existen.
  photoURL?: string
  reactedAt?: number
}

export interface WallMessage {
  id: string
  text: string
  type: WallMessageType
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  createdAt: number
  // Keyed por el device token del reactor — un solo campo reemplaza a los
  // viejos likedBy/dislikedBy, un doc por reactor (no arrays paralelos), y
  // permite agregar reacciones nuevas sin migrar nada.
  reactions: Record<string, WallReaction>
  replies: WallReply[]
  deleted: boolean
  pinned: boolean
}

export interface WallReply {
  id: string
  text: string
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  createdAt: number
}

export type GuestStatus = 'invited' | 'checked_in'

// Solo tiene sentido mientras `checkedOutAt` está seteado (invitado
// actualmente afuera): 'temporary' = puede volver a escanear su QR para
// reingresar, 'final' = checkInGuest bloquea el reingreso (ver
// firebase/guests.ts) salvo que el organizador lo revierta con
// allowGuestReentry. Se limpia a `null` en cada nuevo check-in/reingreso.
export type GuestExitType = 'temporary' | 'final' | null

export type RsvpStatus = 'pending' | 'yes' | 'no'

export interface CompanionData {
  name?: string
  lastName?: string
  phone?: string
}

export interface GuestData {
  id: string
  name: string
  lastName?: string
  phone?: string
  // Al igual que `phone`, vive en `guestContacts/{guestId}` (no en el
  // documento público del invitado) y se fusiona en subscribeToGuests —
  // presente solo para autoregistro e invitados importados por CSV, que son
  // los únicos flujos que hoy capturan email (ver buildNewGuestPayload/
  // registerWalkInGuest en src/firebase/guests.ts y capacity.ts).
  email?: string
  qrToken: string
  status: GuestStatus
  companions: CompanionData[]
  // Invitado creado como "familia o grupo" (nombre de grupo + cantidad de
  // integrantes) en vez de invitado individual. Solo cambia CÓMO se muestra
  // el nombre/cantidad en la UI (ver GuestAddForm/GuestList/GuestPass) — el
  // conteo real de personas sigue siendo partySize() (1 + companions.length),
  // el check-in/QR/estadísticas no distinguen este campo. Ausente/false en
  // invitados creados antes de este campo (siempre invitados individuales).
  isGroup?: boolean
  rsvpStatus: RsvpStatus
  checkedInAt: number | null
  checkedInBy: string | null
  checkedInByEmail: string | null
  checkedOutAt: number | null
  checkedOutByEmail: string | null
  exitType: GuestExitType
  // `lockToken` es un espejo legacy (último dispositivo reconocido) que se
  // mantiene por compatibilidad con el pill "Pase abierto" y el botón
  // "Desbloquear pase" del organizador (GuestDetailSheet). La fuente real
  // de verdad para autorizar escrituras del invitado (RSVP, comprobante de
  // pago, auto-edición) es `lockTokens`: una lista acotada de dispositivos
  // reconocidos para este pase (últimos N, con expulsión del más viejo al
  // llegar al tope — ver claimGuestPass en src/firebase/guests.ts). Permite
  // que el mismo invitado abra el link desde el navegador interno de
  // Instagram/TikTok/WhatsApp/etc. y después desde Safari/Chrome sin quedar
  // bloqueado. Ausente/vacío en invitados nunca abiertos o creados antes de
  // este campo.
  lockToken: string | null
  lockTokens?: string[]
  customData?: Record<string, string>
  paymentStatus: GuestPaymentStatus
  // Método elegido al autoregistrarse (o fijado por el organizador al
  // marcar el pago) — null en eventos gratuitos y en invitados agregados
  // por el organizador que todavía no pagaron. Ver PaymentMethod.
  paymentMethod: PaymentMethod | null
  // Referencia opcional que deja el invitado al marcar "ya pagué" (número de
  // operación, hora del depósito, etc.) — le ahorra al organizador tener que
  // ir a buscarlo por WhatsApp para revisar el comprobante.
  paymentNote?: string
  // Presentes solo cuando el invitado se autoregistró logueado con una
  // cuenta PaseLink (ver registerWalkInGuest en src/firebase/capacity.ts) —
  // null en alta manual del organizador y en todo invitado creado antes de
  // este campo. guestPhotoURL es una copia (denormalizada al momento del
  // registro, no sincronizada después) del photoURL del perfil en ese
  // instante — ver GuestAvatar.tsx para el porqué de no leerlo en vivo.
  guestUid?: string | null
  guestPhotoURL?: string | null
  createdAt: number
}

export type CheckinType = 'check_in' | 'check_out'

export interface CheckinLog {
  id: string
  guestId: string
  guestName: string
  type: CheckinType
  // Solo presente en entradas type: 'check_out' — distingue salida temporal
  // (puede volver) de definitiva (no puede reingresar sin excepción).
  exitKind?: 'temporary' | 'final'
  // Solo presente en entradas type: 'check_in' que corresponden a un
  // reingreso tras una salida temporal (no al primer check-in).
  reentry?: boolean
  timestamp: number
  scannedBy: string
  scannedByEmail: string | null
}

export const PLAN_LABELS: Record<Plan, string> = {
  premium: 'Premium',
}

export const RSVP_LABELS: Record<RsvpStatus, string> = {
  pending: 'Sin responder',
  yes: 'Asistirá',
  no: 'No asistirá',
}

export const PAYMENT_STATUS_LABELS: Record<GuestPaymentStatus, string> = {
  paid: 'Pagado',
  pending_confirmation: 'En revisión',
  unpaid: 'Sin pagar',
  expired: 'Vencido',
}

export interface UserProfile {
  uid: string
  email: string
  firstName: string
  lastName: string
  displayName: string      // firstName + ' ' + lastName
  birthDate: string        // 'YYYY-MM-DD'
  photoURL?: string
  createdAt: number
}

export interface UserInvitation {
  eventId: string
  eventName: string
  eventDate: string
  eventLocation: string
  eventCoverImage?: string
  // Plantilla del evento al momento del registro — alimenta el theming del
  // ticket en MyInvitations.tsx (ver src/templates/ticketTheme.ts).
  // Opcionales: invitaciones guardadas antes de este campo caen al ticket
  // "default" (look actual de PaseLink), sin backfill necesario.
  eventTemplateId?: TemplateId
  eventAccentColor?: string
  guestName: string
  qrToken: string
  type: 'walkin' | 'invited'
  registeredAt: number
}

export type FeedbackCategory = 'suggestion' | 'bug' | 'comment' | 'question' | 'inappropriate' | 'feature_request' | 'other'

export type FeedbackStatus = 'new' | 'in_review' | 'planned' | 'resolved' | 'closed'

export type FeedbackPriority = 'low' | 'normal' | 'high' | 'urgent'

// Buzón de feedback: solo el administrador puede leer estos documentos (ver
// firestore.rules) — ni siquiera el propio autor puede releer lo que envió.
// userId/userEmail son mutuamente excluyentes: userId cuando hay sesión,
// userEmail cuando el envío es anónimo (ver src/firebase/feedback.ts).
export interface Feedback {
  id: string
  userId: string | null
  userEmail: string | null
  userDisplayName: string | null
  subject: string
  message: string
  category: FeedbackCategory
  status: FeedbackStatus
  priority: FeedbackPriority
  tags: string[]
  adminNotes: string
  favorite: boolean
  read: boolean
  createdAt: number
  updatedAt: number
}

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  suggestion: 'Sugerencia',
  bug: 'Reportar un error',
  comment: 'Comentario',
  question: 'Duda',
  inappropriate: 'Comportamiento inapropiado',
  feature_request: 'Solicitud de nueva función',
  other: 'Otro',
}

export const FEEDBACK_STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: 'Nuevo',
  in_review: 'En revisión',
  planned: 'Planeado',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export const FEEDBACK_PRIORITY_LABELS: Record<FeedbackPriority, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
}

// Moderación del muro (src/firebase/moderation.ts, src/firebase/sanctions.ts).
// Un reporte apunta a un comentario o foto puntual; el "contenido" se guarda
// como snapshot (contentSnapshot/contentCaption) porque el original puede
// borrarse después (por el organizador o por el propio admin) y el caso debe
// seguir siendo revisable igual.
export type ReportedContentType = 'comment' | 'photo'

export type ReportStatus = 'pending' | 'in_review' | 'resolved' | 'rejected'

export type ReportActionType =
  | 'status_change'
  | 'note'
  | 'content_deleted'
  | 'sanction_applied'
  | 'sanction_revoked'

export interface ReportActionEntry {
  id: string
  type: ReportActionType
  adminUid: string
  adminEmail: string | null
  detail: string
  createdAt: number
}

// reporterUid/reporterName/reporterEmail siempre se guardan (se necesitan
// para el cooldown y para evitar reportes duplicados) — `anonymous` solo
// controla si el panel de admin los muestra u oculta, no si existen en el
// documento (que de todas formas solo puede leer un admin, ver firestore.rules).
export interface ContentReport {
  id: string
  eventId: string
  eventName: string
  contentType: ReportedContentType
  contentId: string
  contentSnapshot: string
  contentCaption?: string
  contentAuthorName: string
  contentAuthorToken: string
  contentAuthorUid: string | null
  reporterUid: string
  reporterName: string
  reporterEmail: string | null
  anonymous: boolean
  reason: string
  status: ReportStatus
  adminNotes: string
  actionHistory: ReportActionEntry[]
  createdAt: number
  updatedAt: number
}

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  pending: 'Pendiente',
  in_review: 'En revisión',
  resolved: 'Resuelto',
  rejected: 'Rechazado',
}

export const REPORT_CONTENT_TYPE_LABELS: Record<ReportedContentType, string> = {
  comment: 'Comentario',
  photo: 'Fotografía',
}

// Sanciones aplicables a una cuenta desde un reporte (src/firebase/sanctions.ts).
// Diseñado para poder agregar tipos nuevos sin tocar el resto del sistema —
// cada tipo solo determina QUÉ campo de UserSanctionScope toca applySanction.
export type SanctionType = 'warning' | 'ban' | 'suspension' | 'comment_restriction' | 'photo_restriction'

export type SanctionScope = 'global' | 'event'

export const SANCTION_TYPE_LABELS: Record<SanctionType, string> = {
  warning: 'Advertencia',
  ban: 'Baneo permanente',
  suspension: 'Suspensión temporal',
  comment_restriction: 'Restricción de comentarios',
  photo_restriction: 'Restricción de fotos',
}

// bannedUntil/commentBanUntil/photoBanUntil: 0 = sin restricción activa,
// timestamp (ms) en el futuro = restricción activa hasta esa fecha,
// Number.MAX_SAFE_INTEGER = permanente (ver PERMANENT_SANCTION_MS en sanctions.ts).
export interface UserSanctionScopeState {
  bannedUntil: number
  commentBanUntil: number
  photoBanUntil: number
  reason: string
}

export interface UserSanctionSummary {
  uid: string
  warningsCount: number
  global: UserSanctionScopeState
  events: Record<string, UserSanctionScopeState>
  updatedAt: number
}

export interface SanctionHistoryEntry {
  id: string
  type: SanctionType | 'revoked'
  scope: SanctionScope
  eventId: string | null
  eventName: string | null
  reason: string
  durationMs: number | null // null = permanente
  expiresAt: number | null
  adminUid: string
  adminEmail: string | null
  reportId: string | null
  createdAt: number
}

