export type Plan = 'basic' | 'premium'

export type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export type EntryMode = 'list' | 'open' | 'hybrid'

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
  entryMode: EntryMode
  capacity?: number
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  guestCount: number
  checkedInCount: number
  createdAt: number
  updatedAt: number
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

