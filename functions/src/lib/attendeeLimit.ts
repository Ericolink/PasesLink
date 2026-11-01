// Puerto Node de `remainingCapacity` (src/firebase/attendeeLimit.ts) — misma
// función pura, sin CapacityFullError (esa clase es solo del lado cliente;
// acá el llamador decide qué hacer con el número). A diferencia del cliente,
// el Admin SDK sí puede correr una aggregate query dentro de una transacción
// (ver functions/src/waitlist/promote.ts), así que quien llama a esto puede
// pasar el conteo de ofertas activas de waitlist ya leído en la MISMA
// transacción — el chequeo deja de ser best-effort.
interface CapacitySnapshot {
  attendeeLimitEnabled?: boolean
  requiresPayment?: boolean
  peopleCount?: number
  capacity?: number
}

// Evento con pago + límite activado: el cupo cuenta solo a las personas con
// pago confirmado (paidCount), no a las registradas — el registro queda
// abierto sin tope y quien no ha pagado cuando se llena el cupo queda en
// lista de espera (derivado, sin documento propio). Sin pago, el límite
// sigue contando registrados (peopleCount) como siempre. Espejo de
// limitCountsPaid en src/firebase/attendeeLimit.ts y firestore.rules.
export function limitCountsPaid(event: { attendeeLimitEnabled?: unknown; requiresPayment?: unknown }): boolean {
  return event.attendeeLimitEnabled === true && event.requiresPayment === true
}

export function remainingCapacity(event: CapacitySnapshot, offeredCount = 0): number | null {
  if (!event.attendeeLimitEnabled || limitCountsPaid(event)) return null
  return Math.max(0, (event.capacity ?? 0) - (event.peopleCount ?? 0) - offeredCount)
}

export function hasCapacityFor(event: CapacitySnapshot, additionalPeople: number, offeredCount = 0): boolean {
  const remaining = remainingCapacity(event, offeredCount)
  return remaining === null || additionalPeople <= remaining
}

// Contraparte de remainingCapacity para el modo "cupo de pagados": cuántas
// personas más pueden pasar a pagado. null = sin tope de pagos (el evento no
// está en ese modo). Se lee del documento crudo del evento dentro de la
// MISMA transacción que suma paidCount, así que dos confirmaciones
// simultáneas por el último lugar no pueden ganar las dos.
export function remainingPaidCapacity(event: Record<string, unknown>): number | null {
  if (!limitCountsPaid(event)) return null
  const capacity = typeof event.capacity === 'number' ? event.capacity : 0
  const paidCount = typeof event.paidCount === 'number' ? event.paidCount : 0
  return Math.max(0, capacity - paidCount)
}
