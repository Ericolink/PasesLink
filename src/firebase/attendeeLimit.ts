// Límite duro y opcional de asistentes por evento (ver
// CAPACITY_LIMIT_ARCHITECTURE.md). Vive en un archivo propio, separado de
// capacity.ts y guests.ts, para que ambos puedan importarlo sin crear un
// import circular (capacity.ts ya importa de guests.ts).
//
// `assertCapacityAvailable`/`remainingCapacity` son funciones PURAS: no
// abren su propia runTransaction (a diferencia de registerWalkInGuest) a
// propósito, para poder llamarse desde DENTRO de la transacción de quien
// esté creando/editando el invitado — ahí es donde tiene que vivir la
// garantía real de atomicidad. Firestore reintenta automáticamente una
// transacción que pierde un conflicto de versión contra el mismo documento,
// así que dos registros simultáneos por el último lugar nunca terminan los
// dos con éxito: el que reintenta vuelve a leer peopleCount ya actualizado y
// esta función lo rechaza en ese segundo intento.
export class CapacityFullError extends Error {
  constructor() {
    super('Este evento ya alcanzó su capacidad máxima.')
    this.name = 'CapacityFullError'
  }
}

interface CapacitySnapshot {
  attendeeLimitEnabled?: boolean
  peopleCount?: number
  capacity?: number
}

// null = cupo ilimitado (attendeeLimitEnabled ausente/false) — distinto de 0
// (cupo activado y agotado), así que los llamadores no pueden confundir
// "sin límite" con "sin lugares".
export function remainingCapacity(event: CapacitySnapshot): number | null {
  if (!event.attendeeLimitEnabled) return null
  return Math.max(0, (event.capacity ?? 0) - (event.peopleCount ?? 0))
}

// Lanza CapacityFullError si `additionalPeople` no entra en el cupo restante.
// No hace nada (ni lee ni escribe) cuando el evento tiene cupo ilimitado.
export function assertCapacityAvailable(event: CapacitySnapshot, additionalPeople: number): void {
  const remaining = remainingCapacity(event)
  if (remaining !== null && additionalPeople > remaining) throw new CapacityFullError()
}
