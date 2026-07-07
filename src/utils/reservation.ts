import type { EventData, GuestData, PaymentMethod } from '../types'

// Cuánto tiempo se reserva un lugar a un invitado que se autoregistra por
// transferencia antes de que el cupo vuelva a estar disponible. 20 min:
// suficiente para que alguien busque su comprobante sin dar tiempo a que
// alguien "reserve y nunca pague" bloquee el cupo por horas.
export const RESERVATION_HOLD_MINUTES = 20
export const RESERVATION_HOLD_MS = RESERVATION_HOLD_MINUTES * 60 * 1000

// Cuánto tiempo tiene el organizador para aprobar/rechazar un comprobante
// una vez que el invitado marcó "ya pagué" — ver 'pending_confirmation' en
// GuestPaymentStatus. Es deliberadamente más largo que el holding inicial:
// ya no es "¿el invitado va a pagar?" (algo que solo el invitado controla y
// puede resolver en minutos) sino "¿cuándo tiene tiempo el organizador de
// revisarlo?" (depende de una persona ocupada, no de un formulario). Pensado
// para desaparecer en la práctica el día que haya una pasarela real: ese
// plazo dejaría de cumplirse casi nunca porque la confirmación llegaría por
// webhook en segundos, no en horas.
export const PENDING_CONFIRMATION_SLA_HOURS = 48
export const PENDING_CONFIRMATION_SLA_MS = PENDING_CONFIRMATION_SLA_HOURS * 60 * 60 * 1000

export function holdExpiresAtFromNow(): number {
  return Date.now() + RESERVATION_HOLD_MS
}

export function pendingConfirmationDeadlineFromNow(): number {
  return Date.now() + PENDING_CONFIRMATION_SLA_MS
}

// Único lugar de verdad para decidir el cronómetro inicial de un invitado
// que se acaba de autoregistrar (capacity.ts) — depende únicamente de si el
// evento cobra y qué método eligió, nunca de `entryMode`: cómo llegó el
// invitado a la lista (autoregistro vs. agregado a mano por el organizador)
// ya está resuelto por QUÉ FUNCIÓN lo crea (registerWalkInGuest vs. addGuest
// en firebase/guests.ts) — un invitado agregado a mano nunca pasa por acá,
// así que este archivo no necesita (ni debe) volver a preguntarse "¿cómo
// entran los invitados a este evento?".
//
// - Sin cobro, o efectivo: sin cronómetro — efectivo se paga presencialmente
//   el día del evento, un plazo de minutos no tiene sentido si faltan
//   semanas (ver GuestPaymentStatus).
// - Transferencia: cronómetro corto — hay un comprobante verificable, así
//   que un plazo real tiene sentido y protege el cupo de alguien que nunca
//   va a pagar.
export function initialHoldExpiresAt(requiresPayment: boolean, method: PaymentMethod | null): number | null {
  if (!requiresPayment) return null
  if (method !== 'transfer') return null
  return holdExpiresAtFromNow()
}

// Método a asignarle a un invitado que se crea SIN que nadie elija método en
// el momento (promoción automática desde lista de espera): preferimos
// 'cash' cuando el evento lo ofrece (no impone cronómetro a alguien que no
// pidió ser promovido justo ahora) y solo cae a 'transfer' si efectivo no es
// una opción para ese evento.
export function defaultPaymentMethodForPromotion(paymentMethods: PaymentMethod[]): PaymentMethod {
  return paymentMethods.includes('cash') ? 'cash' : 'transfer'
}

// "Vencido" cubre dos momentos: el barrido todavía no corrió (paymentStatus
// sigue en 'unpaid'/'pending_confirmation' pero holdExpiresAt ya pasó) o ya
// corrió (paymentStatus === 'expired'). La UI (GuestPass/GuestList/Scanner)
// usa esto para mostrar "venció" al instante sin esperar al cron — ver
// scripts/sweep-reservations.mjs, que es quien hace la transición real.
export function isHoldExpired(
  guest: Pick<GuestData, 'paymentStatus' | 'holdExpiresAt'>,
  now = Date.now(),
): boolean {
  if (guest.paymentStatus === 'expired') return true
  if (guest.paymentStatus !== 'unpaid' && guest.paymentStatus !== 'pending_confirmation') return false
  return guest.holdExpiresAt !== null && guest.holdExpiresAt <= now
}

// Cuánto falta (en ms) para que venza el cronómetro activo — negativo si ya
// venció. null si no hay ninguno corriendo. Usado por la cuenta regresiva
// del pase (holding inicial o, más adelante, el SLA de pending_confirmation).
export function holdMsRemaining(guest: Pick<GuestData, 'holdExpiresAt'>, now = Date.now()): number | null {
  if (guest.holdExpiresAt === null) return null
  return guest.holdExpiresAt - now
}

// Solo transferencia tiene algo que "confirmar" de este modo — efectivo se
// paga presencialmente, no hay comprobante que enviar. Se permite tanto
// desde 'unpaid' (dentro o fuera de plazo, ver isHoldExpired) como desde
// 'expired' (reclamo tardío: el invitado igual puede avisar que pagó, el
// organizador decide si todavía hay lugar al aprobarlo).
export function canSubmitPaymentProof(guest: Pick<GuestData, 'paymentMethod' | 'paymentStatus'>): boolean {
  return guest.paymentMethod === 'transfer' && (guest.paymentStatus === 'unpaid' || guest.paymentStatus === 'expired')
}

export function eventOffersMethod(event: Pick<EventData, 'paymentMethods'>, method: PaymentMethod): boolean {
  return event.paymentMethods.includes(method)
}
