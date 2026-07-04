// Por ahora solo existe 'premium' (gratis durante el lanzamiento). Se deja como
// union (no un literal suelto) para poder reintroducir un tier de pago después
// sin tocar el resto del código, que ya está escrito en términos de `Plan`.
export type Plan = 'premium'

export type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export type EntryMode = 'list' | 'open' | 'hybrid'

export type GuestPaymentStatus = 'unpaid' | 'paid'

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
  customFields?: CustomField[]
  requiresPayment: boolean
  ticketPrice: number
  currency: string
  paymentInstructions: string
  timeline?: TimelineEntry[]
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  guestCount: number
  checkedInCount: number
  coOrganizersMap?: Record<string, string>  // { [uid]: email }
  createdAt: number
  updatedAt: number
}

export interface WaitlistEntry {
  id: string
  name: string
  lastName: string
  phone: string
  createdAt: number
  status: 'waiting' | 'promoted'
  qrToken?: string
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
  createdAt: number
}

export type GuestStatus = 'invited' | 'checked_in'

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
  qrToken: string
  status: GuestStatus
  companions: CompanionData[]
  rsvpStatus: RsvpStatus
  checkedInAt: number | null
  checkedInBy: string | null
  checkedInByEmail: string | null
  checkedOutAt: number | null
  checkedOutByEmail: string | null
  lockToken: string | null
  customData?: Record<string, string>
  paymentStatus: GuestPaymentStatus
  createdAt: number
}

export type CheckinType = 'check_in' | 'check_out'

export interface CheckinLog {
  id: string
  guestId: string
  guestName: string
  type: CheckinType
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

export interface UserProfile {
  uid: string
  email: string
  firstName: string
  lastName: string
  displayName: string      // firstName + ' ' + lastName
  birthDate: string        // 'YYYY-MM-DD'
  photoURL?: string
  notifyOnCheckin?: boolean
  createdAt: number
}

export interface UserInvitation {
  eventId: string
  eventName: string
  eventDate: string
  eventLocation: string
  eventCoverImage?: string
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

