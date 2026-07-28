import type { GuestData } from '../types'

export interface AudienceFilter {
  rsvp: 'all' | 'pending' | 'yes' | 'no'
  payment: 'all' | 'unpaid' | 'pending_confirmation' | 'paid'
}

export const DEFAULT_AUDIENCE_FILTER: AudienceFilter = { rsvp: 'all', payment: 'all' }

// Solo dos dimensiones reales existen hoy en el modelo de datos: rsvpStatus y
// GuestPaymentStatus. "Lista de espera"/"cancelados" NO se modelan — el
// waitlist fue eliminado a propósito (ver firestore.rules, match
// /waitlist/{entryId}) y no hay flag de "cancelado" por invitado.
export function matchesAudienceFilter(guest: GuestData, filter: AudienceFilter): boolean {
  if (filter.rsvp !== 'all' && guest.rsvpStatus !== filter.rsvp) return false
  // 'expired' es legacy (ver GuestPaymentStatus en types/index.ts) — se trata
  // como 'unpaid', nunca se enumera junto a 'unpaid' a mano.
  if (filter.payment === 'unpaid' && (guest.paymentStatus === 'paid' || guest.paymentStatus === 'pending_confirmation')) return false
  if (filter.payment !== 'all' && filter.payment !== 'unpaid' && guest.paymentStatus !== filter.payment) return false
  return true
}
