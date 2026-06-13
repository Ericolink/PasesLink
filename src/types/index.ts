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
  accentColor?: string
  logoUrl?: string
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

export interface EventTemplate {
  id: string
  label: string
  description: string
  welcomeMessage: string
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: 'birthday',
    label: 'Cumpleaños',
    description: 'Celebración de cumpleaños con familiares y amigos.',
    welcomeMessage: '¡Bienvenido/a a la fiesta! Que disfrutes mucho.',
  },
  {
    id: 'wedding',
    label: 'Boda',
    description: 'Celebración de boda. Por favor presenta tu pase en la entrada.',
    welcomeMessage: '¡Gracias por acompañarnos en este día tan especial!',
  },
  {
    id: 'corporate',
    label: 'Evento corporativo',
    description: 'Evento corporativo. El acceso es exclusivo para invitados con pase.',
    welcomeMessage: 'Bienvenido/a, esperamos que disfrutes del evento.',
  },
  {
    id: 'other',
    label: 'Otro',
    description: '',
    welcomeMessage: '¡Bienvenido/a al evento!',
  },
]
