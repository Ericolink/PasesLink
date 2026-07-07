import type { GuestData, PaymentMethod } from '../../types'
import { partySize, guestPresence } from '../../firebase/guests'
import { isHoldExpired } from '../../utils/reservation'

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  transfer: 'transferencia',
  cash: 'efectivo',
}

export function guestDisplayName(guest: Pick<GuestData, 'name' | 'lastName' | 'isGroup'>): string {
  return guest.isGroup ? guest.name : `${guest.name} ${guest.lastName || ''}`.trim()
}

// Sección donde cae la fila. Deliberadamente más angosta que "todo lo que
// falta cobrar": un `unpaid` con cronómetro todavía corriendo (transferencia
// dentro de plazo) o sin cronómetro (efectivo, se cobra al ingresar) no
// requiere que el organizador haga nada TODAVÍA — se resuelve solo cuando el
// invitado paga o cuando el plazo vence (y ahí sí pasa a 'attention'). Lo
// urgente de verdad es: comprobante esperando aprobación, reserva ya vencida,
// o pase bloqueado en otro dispositivo.
export type GuestUrgency = 'attention' | 'confirmed' | 'unanswered' | 'declined'

export function needsAttention(guest: GuestData, requiresPayment: boolean): boolean {
  if (guest.lockToken) return true
  if (!requiresPayment) return false
  if (guest.paymentStatus === 'pending_confirmation') return true
  return guest.paymentStatus === 'unpaid' && guest.holdExpiresAt !== null && isHoldExpired(guest)
}

export function guestUrgency(guest: GuestData, requiresPayment: boolean): GuestUrgency {
  if (needsAttention(guest, requiresPayment)) return 'attention'
  if (guest.rsvpStatus === 'no' || guestPresence(guest) === 'final_out') return 'declined'
  if (guest.rsvpStatus === 'pending') return 'unanswered'
  return 'confirmed'
}

export const SECTION_ORDER: { key: GuestUrgency; title: string; collapsedByDefault: boolean }[] = [
  { key: 'attention', title: 'Necesita tu atención', collapsedByDefault: false },
  { key: 'confirmed', title: 'Confirmados', collapsedByDefault: false },
  { key: 'unanswered', title: 'Sin responder', collapsedByDefault: false },
  { key: 'declined', title: 'No asistirán', collapsedByDefault: true },
]

export function groupGuestsByUrgency(guests: GuestData[], requiresPayment: boolean): Record<GuestUrgency, GuestData[]> {
  const groups: Record<GuestUrgency, GuestData[]> = { attention: [], confirmed: [], unanswered: [], declined: [] }
  for (const guest of guests) groups[guestUrgency(guest, requiresPayment)].push(guest)
  return groups
}

// Color del indicador de la fila. Comparte `needsAttention` como única fuente
// de "esto requiere tu acción ahora" con `guestUrgency` (arriba), pero no es
// un mapeo 1 a 1 con la sección: un invitado en la sección "Confirmados" que
// todavía debe (transferencia dentro de plazo, o efectivo a pagar al
// ingresar) se marca 'wait' en vez de 'ok' — no está "al día" solo porque no
// necesita intervención tuya todavía.
export type GuestIndicator = 'action' | 'ok' | 'wait' | 'off'

export function guestIndicator(guest: GuestData, requiresPayment: boolean): GuestIndicator {
  if (needsAttention(guest, requiresPayment)) return 'action'
  if (guest.rsvpStatus === 'no' || guestPresence(guest) === 'final_out') return 'off'
  if (guest.rsvpStatus === 'pending') return 'wait'
  if (requiresPayment && guest.paymentStatus !== 'paid') return 'wait'
  return 'ok'
}

function money(currency: string, amount: number): string {
  return `${currency}${amount.toLocaleString('es')}`
}

// Un único dato dinámico por fila — el más urgente para ESE invitado en este
// momento, nunca la ficha completa (esa vive en GuestDetailSheet). El orden
// de prioridad replica el que hoy arma el stack de badges en la card vieja.
export function getGuestSubtitle(
  guest: GuestData,
  ctx: { requiresPayment: boolean; ticketPrice: number; currency: string },
): string {
  const amount = ctx.ticketPrice * partySize(guest)

  if (guest.lockToken) return 'Pase abierto en otro dispositivo'

  if (guest.paymentStatus === 'pending_confirmation') {
    return guest.paymentNote ? `Comprobante enviado · ref. ${guest.paymentNote}` : 'Comprobante enviado · a revisar'
  }

  if (ctx.requiresPayment && guest.paymentStatus === 'unpaid') {
    if (isHoldExpired(guest)) return `Reserva vencida · ${money(ctx.currency, amount)}`
    if (guest.holdExpiresAt !== null) {
      const time = new Date(guest.holdExpiresAt).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
      return `${money(ctx.currency, amount)} pendiente · vence ${time}`
    }
    return `${money(ctx.currency, amount)} pendiente`
  }

  const presence = guestPresence(guest)
  if (presence === 'inside') return 'Adentro'
  if (presence === 'temp_out') return 'Salida temporal'
  if (presence === 'final_out') return 'Salió del evento'

  if (guest.rsvpStatus === 'no') return 'No asistirá'

  if (guest.rsvpStatus === 'pending') {
    const size = partySize(guest)
    return size > 1 ? `${size - 1} acompañante${size - 1 > 1 ? 's' : ''} · sin responder` : 'Sin responder'
  }

  if (guest.isGroup) return `${partySize(guest)} integrantes`

  const companionsText = guest.companions.length > 0 ? `${guest.companions.length} acompañante${guest.companions.length > 1 ? 's' : ''} · ` : ''
  if (ctx.requiresPayment && guest.paymentStatus === 'paid') {
    return `${companionsText}Pagó${guest.paymentMethod ? ` (${PAYMENT_METHOD_LABELS[guest.paymentMethod]})` : ''}`
  }
  return `${companionsText}Confirmado`
}
