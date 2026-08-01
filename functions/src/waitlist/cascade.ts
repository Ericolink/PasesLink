// Cascada de oferta: reacciona a que se liberó (o se creó, en el caso del
// vencimiento de una oferta) capacidad, y ofrece el/los lugares disponibles
// a la fila. Reemplaza el "best-effort de cliente + barrido cada 10 min" del
// RFC original — acá hay una sola implementación, corrida siempre con
// privilegios de Admin SDK (ver §1 de WAITLIST_RECONFIRMATION_ARCHITECTURE.md).
import { AggregateField, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { attemptPromote } from './promote.js'

const CANDIDATE_BATCH_SIZE = 20

export interface CascadePromotion {
  entryId: string
  offerToken: string
  entry: DocumentData
}

export interface CascadeOutcome {
  promoted: CascadePromotion[]
}

// Cuántas personas ya tienen una oferta activa (status=='offered', sin
// vencer todavía) — no se guarda como contador denormalizado en EventData
// (waitlistOfferedCount): con la cascada centralizada en un único lugar, una
// aggregate query fresca es más simple y no puede desincronizarse (ver §6
// del RFC — no hay ningún punto de escritura que se pueda olvidar de
// actualizarla, porque no existe como valor guardado).
async function countOfferedPeople(db: Firestore, eventId: string): Promise<number> {
  const snap = await db.collection('events').doc(eventId).collection('waitlist')
    .where('status', '==', 'offered')
    .aggregate({ totalPartySize: AggregateField.sum('partySize') })
    .get()
  return snap.data().totalPartySize ?? 0
}

// Top N 'waiting' por orden real (priorityBoost desc, createdAt asc),
// saltando las que ya se intentaron en este mismo `runCascade` (excludeIds)
// y las que no entran en `remaining` — nunca le ofrece un lugar a una
// familia de 3 si solo queda 1 lugar (ver §8 del RFC): sigue buscando la
// próxima que sí entre, no bloquea el resto de la fila detrás de un grupo
// grande.
async function nextFittingCandidate(
  db: Firestore,
  eventId: string,
  remaining: number,
  excludeIds: ReadonlySet<string>,
): Promise<{ id: string; partySize: number } | null> {
  const snap = await db.collection('events').doc(eventId).collection('waitlist')
    .where('status', '==', 'waiting')
    .orderBy('priorityBoost', 'desc')
    .orderBy('createdAt', 'asc')
    .limit(CANDIDATE_BATCH_SIZE)
    .get()

  for (const doc of snap.docs) {
    if (excludeIds.has(doc.id)) continue
    const partySize = (doc.data().partySize as number) ?? 1
    if (partySize <= remaining) return { id: doc.id, partySize }
  }
  return null
}

// `excludeIds`: entradas que esta corrida en particular no debe volver a
// ofertar, aunque sean las primeras de la fila — usado por
// cancelWaitlistOffer.ts: cancelar una oferta vuelve la entrada a
// 'waiting' EN SU MISMA posición (no fue elección del invitado), así que
// sin esto la cascada la volvería a ofertar de inmediato a la misma
// persona, haciendo que "cancelar" nunca cambie nada en el caso común
// (ella sigue siendo la primera de la fila). Sí puede volver a ofertársele
// en una corrida FUTURA (otro release, otra acción del organizador) — el
// exclude es solo para esta invocación puntual, no un estado permanente.
export async function runCascade(db: Firestore, eventId: string, excludeIds: ReadonlySet<string> = new Set()): Promise<CascadeOutcome> {
  const eventSnap = await db.collection('events').doc(eventId).get()
  if (!eventSnap.exists) return { promoted: [] }
  const event = eventSnap.data()!
  if (!event.attendeeLimitEnabled) return { promoted: [] }

  const capacity = (event.capacity as number) ?? 0
  const peopleCount = (event.peopleCount as number) ?? 0
  // Esta lectura de offeredCount (y su actualización en memoria más abajo)
  // es solo una HEURÍSTICA para decidir a qué candidato intentarle a
  // continuación y cuándo dejar de buscar — no es la garantía real. La
  // garantía real (nunca ofertar más de lo que hay) vive DENTRO de
  // attemptPromote, que recalcula esto mismo de forma transaccional en cada
  // intento (ver el comentario largo en promote.ts). Por eso un resultado
  // `no_capacity` acá no es un bug: solo significa que el estimado local ya
  // quedó desactualizado por otra escritura concurrente, y el loop sigue
  // con el próximo candidato en vez de romper.
  let offeredCount = await countOfferedPeople(db, eventId)

  const promoted: CascadePromotion[] = []
  const consideredIds = new Set<string>(excludeIds)

  for (;;) {
    const remaining = capacity - peopleCount - offeredCount
    if (remaining <= 0) break

    const candidate = await nextFittingCandidate(db, eventId, remaining, consideredIds)
    if (!candidate) break
    consideredIds.add(candidate.id)

    const result = await attemptPromote(db, eventId, candidate.id, 'fifo')

    if (result.ok) {
      promoted.push({ entryId: candidate.id, offerToken: result.offerToken, entry: result.entry })
      offeredCount += candidate.partySize
    } else if (result.reason === 'event_too_close') {
      // No depende de qué candidato se haya elegido — ningún otro va a
      // pasar esta condición tampoco en esta misma corrida.
      break
    }
    // 'not_waiting'/'not_found'/'no_capacity': alguien más (otra promoción
    // manual, u otra invocación concurrente de la cascada) se adelantó, o
    // el estimado local de `remaining` ya no reflejaba la realidad — se
    // sigue el loop, la próxima vuelta descarta este id (ya está en
    // consideredIds) y busca otro candidato.
  }

  return { promoted }
}
