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
import { httpsCallable } from 'firebase/functions'
import { functions } from './config'
import { captureException } from '../lib/sentry'

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
// "sin límite" con "sin lugares". `offeredCount` (default 0): personas con
// una oferta de lista de espera activa ahora mismo (WAITLIST_
// RECONFIRMATION_ARCHITECTURE.md §7) — sin restarlas, un alta manual del
// organizador podía pisar el lugar que una oferta activa ya le había
// prometido a alguien de la fila.
export function remainingCapacity(event: CapacitySnapshot, offeredCount = 0): number | null {
  if (!event.attendeeLimitEnabled) return null
  return Math.max(0, (event.capacity ?? 0) - (event.peopleCount ?? 0) - offeredCount)
}

// Lanza CapacityFullError si `additionalPeople` no entra en el cupo restante.
// No hace nada (ni lee ni escribe) cuando el evento tiene cupo ilimitado.
export function assertCapacityAvailable(event: CapacitySnapshot, additionalPeople: number, offeredCount = 0): void {
  const remaining = remainingCapacity(event, offeredCount)
  if (remaining !== null && additionalPeople > remaining) throw new CapacityFullError()
}

// ÚNICA función de este archivo que no es pura: lee en vivo cuántas
// personas tienen una oferta de lista de espera activa (status=='offered')
// para este evento. Se llama ANTES de abrir la transacción de alta (nunca
// adentro — ni el SDK de cliente ni una Callable Function pueden correr
// dentro de una runTransaction del lado del cliente), así que es un
// chequeo best-effort para EVITAR la colisión en el caso común, no la
// garantía dura — esa sigue viviendo en la Cloud Function
// `confirmWaitlistOffer`, que revalida capacidad de forma autoritativa al
// crear el guest doc.
//
// Vía Callable Function (Admin SDK) en vez de una aggregate query directa
// del cliente: `allow list` en firestore.rules está escrito en términos de
// `request.query.limit` (mismo patrón que ya protege el acceso por token a
// `guests`), y una query de agregación no lleva `limit` — intentarlo
// directo desde el cliente choca con esa regla. No es una pérdida de
// robustez: esta lectura nunca fue la garantía real, solo la optimización
// que evita el choque en el caso común.
//
// httpsCallable(functions, ...) se construye acá adentro (no una sola vez a
// nivel de módulo) para que solo IMPORTAR este archivo no dispare la
// inicialización del SDK de Functions — importa remainingCapacity/
// assertCapacityAvailable (las funciones puras) desde un test no debería
// requerir mockear './config'.
// Si esta llamada falla (red caída, Cloud Function con un problema
// transitorio, bloqueo de CSP, etc.), NO debe tumbar el alta del invitado
// que la está esperando: es solo la optimización que evita la colisión en
// el caso común, según el comentario de arriba, no la garantía dura. Sin
// este try/catch, cualquier falla de esta única función (aunque el resto
// del sistema esté sano) bloqueaba TODAS las altas de invitados de la app
// (individual, familia/grupo, carga masiva, CSV) con un error genérico —
// desproporcionado para un chequeo best-effort. Se degrada a 0 (equivale a
// "sin ofertas activas ahora mismo") y se reporta a Sentry para poder
// notar si empieza a fallar seguido.
export async function fetchOfferedWaitlistCount(eventId: string): Promise<number> {
  const getOfferedWaitlistCount = httpsCallable<{ eventId: string }, { count: number }>(functions, 'getOfferedWaitlistCount')
  try {
    const result = await getOfferedWaitlistCount({ eventId })
    return result.data.count
  } catch (err) {
    console.error('Error obteniendo el conteo de ofertas de lista de espera:', err)
    captureException(err, { tags: { flow: 'attendeeLimit.fetchOfferedWaitlistCount' } })
    return 0
  }
}
