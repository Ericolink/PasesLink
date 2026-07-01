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

export interface WallMessage {
  id: string
  text: string
  type: WallMessageType
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  createdAt: number
  likedBy: string[]
  dislikedBy: string[]
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

