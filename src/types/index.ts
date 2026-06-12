export type Plan = 'basic' | 'premium'

export type PaymentStatus = 'pending' | 'paid' | 'free_trial'

export type EventStatus = 'active' | 'cancelled' | 'archived'

export interface EventData {
  id: string
  ownerId: string
  name: string
  date: string
  location: string
  description?: string
  welcomeMessage?: string
  plan: Plan
  paymentStatus: PaymentStatus
  status: EventStatus
  guestCount: number
  checkedInCount: number
  createdAt: number
  updatedAt: number
}

export type GuestStatus = 'invited' | 'checked_in'

export interface GuestData {
  id: string
  name: string
  email?: string
  phone?: string
  qrToken: string
  status: GuestStatus
  checkedInAt: number | null
  checkedInBy: string | null
  createdAt: number
}

export interface CheckinLog {
  id: string
  guestId: string
  guestName: string
  timestamp: number
  scannedBy: string
}

export const PLAN_LABELS: Record<Plan, string> = {
  basic: 'Básico',
  premium: 'Premium',
}
