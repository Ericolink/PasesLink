// Núcleo de la promoción de una entrada de lista de espera — "función pura"
// en el mismo sentido que src/firebase/attendeeLimit.ts en el bundle de
// cliente: no depende de contexto de trigger/callable, recibe una instancia
// de Firestore y sus parámetros. Llamada desde el trigger de cascada
// automática (reason: 'fifo') y desde la Callable de asignación manual
// (reason: 'manual') — una sola implementación, dos disparadores (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md).
//
// La oferta NO vence sola (decisión del usuario, distinta a la ventana de
// 24h del diseño original): queda 'offered' hasta que el invitado responda
// (confirmWaitlistOffer/declineWaitlistOffer) o el organizador la cancele a
// mano (cancelWaitlistOffer) — mismo criterio "sin presión automática" que
// ya se eligió para la liberación de reconfirmación.
//
// El chequeo de capacidad vive DENTRO de esta transacción (lee el evento +
// una aggregate query de ofertas activas, ambos vía tx.get) a propósito: si
// viviera afuera (ej. en runCascade, calculado una sola vez y pasado como
// parámetro), dos invocaciones concurrentes de la cascada para el mismo
// evento podrían cada una "ver" el mismo remanente y ofertarle a DOS
// entradas distintas — ninguna de las dos chocaría entre sí porque tocan
// documentos distintos (la entrada de waitlist de cada una), así que
// Firestore no las serializaría. Al releer capacidad+ofertas ACÁ ADENTRO,
// cualquier escritura concurrente que cambie ese resultado (otra promoción,
// un guest que se crea/borra) hace que el conflicto de versión de Firestore
// aborte y reintente la transacción que llega segunda — mismo mecanismo,
// aplicado al mismo problema, que ya prueba capacity.test.ts para
// registerWalkInGuest.
import { randomUUID } from 'node:crypto'
import { AggregateField, type DocumentData, type Firestore } from 'firebase-admin/firestore'

// Piso: no tiene sentido crear una oferta (alguien tiene que verla por
// email y responder) si al evento le quedan menos de 2h — a esa distancia,
// el organizador resuelve en persona (ver "Enviar a lista de espera" +
// "Asignar lugar" manual). No está atado a ninguna ventana de vencimiento
// (ya no existe una), es un piso independiente.
export const MIN_TIME_BEFORE_EVENT_MS = 2 * 60 * 60 * 1000

export type PromotionReason = 'fifo' | 'manual'

export type AttemptPromoteResult =
  | { ok: true; offerToken: string; entry: DocumentData }
  | { ok: false; reason: 'not_found' | 'not_waiting' | 'no_capacity' | 'event_too_close' }

// Mismo cálculo que eventDateTimeMs en src/utils/time.ts (no se cross-importa
// desde functions/, ver convención en src/index.ts) — sin startTime válido se
// asume 00:00.
function eventStartMs(date: string, startTime?: string): number {
  const time = startTime && /^\d{2}:\d{2}$/.test(startTime) ? startTime : '00:00'
  const ms = new Date(`${date}T${time}:00`).getTime()
  return Number.isNaN(ms) ? Infinity : ms
}

function isEventTooClose(eventDate: string, eventStartTime: string | undefined, now: number): boolean {
  return eventStartMs(eventDate, eventStartTime) - now < MIN_TIME_BEFORE_EVENT_MS
}

export async function attemptPromote(
  db: Firestore,
  eventId: string,
  entryId: string,
  reason: PromotionReason,
): Promise<AttemptPromoteResult> {
  const eventRef = db.collection('events').doc(eventId)
  const waitlistRef = eventRef.collection('waitlist')
  const entryRef = waitlistRef.doc(entryId)

  return db.runTransaction(async (tx) => {
    const [eventSnap, entrySnap] = await Promise.all([tx.get(eventRef), tx.get(entryRef)])
    if (!eventSnap.exists || !entrySnap.exists) return { ok: false, reason: 'not_found' }

    const entry = entrySnap.data()!
    if (entry.status !== 'waiting') return { ok: false, reason: 'not_waiting' }

    const event = eventSnap.data()!
    const capacity = (event.capacity as number) ?? 0
    const peopleCount = (event.peopleCount as number) ?? 0
    const offeredAgg = await tx.get(
      waitlistRef.where('status', '==', 'offered').aggregate({ total: AggregateField.sum('partySize') }),
    )
    const offeredCount = offeredAgg.data().total ?? 0
    const remaining = capacity - peopleCount - offeredCount
    const partySize = (entry.partySize as number) ?? 1
    if (partySize > remaining) return { ok: false, reason: 'no_capacity' }

    if (isEventTooClose(event.date as string, event.startTime as string | undefined, Date.now())) {
      return { ok: false, reason: 'event_too_close' }
    }

    const offerToken = randomUUID()

    tx.update(entryRef, {
      status: 'offered',
      offerToken,
      offerExpiresAt: null,
      promotionReason: reason,
    })

    return { ok: true, offerToken, entry }
  })
}

export type CancelOfferResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_offered' }

// El organizador cancela una oferta activa (nadie respondió, o cambió de
// idea) — a diferencia de que el propio invitado decline (declineWaitlistOffer,
// terminal, status 'declined'), esto vuelve la entrada a 'waiting'
// conservando su priorityBoost/createdAt: no fue elección de esa persona,
// así que no pierde su lugar en la fila. El caller (cancelWaitlistOffer.ts)
// dispara la cascada después de esto para ofertarle a quien siga.
export async function cancelOffer(db: Firestore, eventId: string, entryId: string): Promise<CancelOfferResult> {
  const entryRef = db.collection('events').doc(eventId).collection('waitlist').doc(entryId)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(entryRef)
    if (!snap.exists) return { ok: false, reason: 'not_found' }
    if (snap.data()!.status !== 'offered') return { ok: false, reason: 'not_offered' }
    tx.update(entryRef, {
      status: 'waiting',
      offerToken: null,
      offerExpiresAt: null,
      promotionReason: null,
    })
    return { ok: true }
  })
}
