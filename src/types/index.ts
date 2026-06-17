export type Plan = 'basic' | 'premium'

export type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export type EntryMode = 'list' | 'open' | 'hybrid'

export type CustomFieldType = 'text' | 'number' | 'email' | 'phone'

export interface CustomField {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
}

export interface EventData {
  id: string
  ownerId: string
  name: string
  date: string
  location: string
  description?: string
  coverImage?: string
  accentColor?: string
  welcomeMessage?: string
  mapsUrl?: string
  entryMode: EntryMode
  capacity?: number
  customFields?: CustomField[]
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  guestCount: number
  checkedInCount: number
  createdAt: number
  updatedAt: number
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

export interface GuestData {
  id: string
  name: string
  email?: string
  phone?: string
  qrToken: string
  status: GuestStatus
  companions: number
  rsvpStatus: RsvpStatus
  checkedInAt: number | null
  checkedInBy: string | null
  checkedInByEmail: string | null
  checkedOutAt: number | null
  checkedOutByEmail: string | null
  lockToken: string | null
  customData?: Record<string, string>
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
  basic: 'Básico',
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

