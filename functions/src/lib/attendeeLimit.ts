// Puerto Node de `remainingCapacity` (src/firebase/attendeeLimit.ts) — misma
// función pura, sin CapacityFullError (esa clase es solo del lado cliente;
// acá el llamador decide qué hacer con el número). A diferencia del cliente,
// el Admin SDK sí puede correr una aggregate query dentro de una transacción
// (ver functions/src/waitlist/promote.ts), así que quien llama a esto puede
// pasar el conteo de ofertas activas de waitlist ya leído en la MISMA
// transacción — el chequeo deja de ser best-effort.
interface CapacitySnapshot {
  attendeeLimitEnabled?: boolean
  peopleCount?: number
  capacity?: number
}

export function remainingCapacity(event: CapacitySnapshot, offeredCount = 0): number | null {
  if (!event.attendeeLimitEnabled) return null
  return Math.max(0, (event.capacity ?? 0) - (event.peopleCount ?? 0) - offeredCount)
}

export function hasCapacityFor(event: CapacitySnapshot, additionalPeople: number, offeredCount = 0): boolean {
  const remaining = remainingCapacity(event, offeredCount)
  return remaining === null || additionalPeople <= remaining
}
