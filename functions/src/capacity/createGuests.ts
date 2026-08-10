// Núcleo compartido de "crear invitados respetando el cupo del evento" —
// única implementación usada por las tres altas manuales del organizador
// (addGuest, addGuestsBulk, addGuestsFromRows, ver functions/src/callable/).
// Antes cada una reimplementaba su propia runTransaction de cliente, con la
// misma lectura de capacity/peopleCount y el mismo offeredCount best-effort
// repetida tres veces (ver git history de src/firebase/guests.ts). Ahora las
// tres delegan acá: mismo cupo, mismo criterio de lista de espera, mismos
// contadores, un solo lugar para mantener.
//
// Mismo patrón que registerWalkInGuest.ts: el conteo de ofertas activas de
// lista de espera (offeredCount) se lee DENTRO de la transacción (aggregate
// query, Admin SDK) — el chequeo de cupo es una garantía atómica real, no
// best-effort como era del lado del cliente. Firestore reintenta
// automáticamente una transacción que pierde un conflicto de versión, así
// que dos altas simultáneas por el último lugar nunca terminan las dos con
// éxito.
import { AggregateField, FieldValue, type Firestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { remainingCapacity } from '../lib/attendeeLimit.js'
import { applyCounterDeltas } from '../lib/counters/index.js'

export class CapacityFullError extends Error {
  constructor() {
    super('Este evento ya alcanzó su capacidad máxima.')
    this.name = 'CapacityFullError'
  }
}

export interface GuestCompanionInput {
  name?: string
  lastName?: string
  phone?: string
  phoneCountry?: string
}

export interface GuestContactInput {
  phone?: string
  phoneCountry?: string
  email?: string
}

// Forma ya VALIDADA y normalizada de un invitado a crear — cada callable
// arma esto a partir de su propia forma de entrada (distinta entre las
// tres: alta individual con acompañantes, lista de nombres pegados, filas de
// CSV con teléfono/email), pero a partir de acá las tres comparten
// exactamente el mismo camino de escritura.
export interface GuestWrite {
  name: string
  lastName?: string
  isGroup?: boolean
  customData?: Record<string, string>
  companions: GuestCompanionInput[]
  contact?: GuestContactInput
}

export interface CreateGuestsResult {
  createdIds: string[]
  // Invitados que NO entraron por falta de cupo, en el mismo orden en que se
  // pidieron — "llenar lo que entra + reportar" (CAPACITY_LIMIT_ARCHITECTURE.md
  // §8), nunca todo-o-nada en modo 'best-fit'. Siempre vacío en modo 'strict'
  // (ahí se lanza CapacityFullError en su lugar).
  skipped: GuestWrite[]
}

function generateQrToken(): string {
  return randomUUID().replace(/-/g, '')
}

function partySizeOf(guest: GuestWrite): number {
  return 1 + guest.companions.length
}

// Mismo documento que buildNewGuestPayload armaba del lado del cliente
// (src/firebase/guests.ts) — puerto exacto, ya que el resto de la app
// (GuestList, GuestPass, estadísticas) sigue esperando esta misma forma sin
// importar quién la escriba.
function buildGuestPayload(guest: GuestWrite) {
  return {
    name: guest.name,
    lastName: guest.lastName || '',
    companions: guest.companions,
    isGroup: guest.isGroup || false,
    // Las 3 altas manuales que comparten esta función (addGuest,
    // addGuestsBulk, addGuestsFromRows) son siempre del organizador — nunca
    // sujetas a EventData.maxCompanions (ese tope solo rige el autoregistro
    // público, ver registerWalkInGuest.ts). Ver GuestData.registrationSource.
    registrationSource: 'organizer' as const,
    customData: guest.customData || {},
    rsvpStatus: 'pending' as const,
    qrToken: generateQrToken(),
    status: 'invited' as const,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    exitType: null,
    lockToken: null,
    paymentStatus: 'unpaid' as const,
    paymentMethod: null,
    createdAt: FieldValue.serverTimestamp(),
  }
}

function buildContactPayload(contact: GuestContactInput): Record<string, string> | null {
  const payload: Record<string, string> = {}
  if (contact.phone) {
    payload.phone = contact.phone
    if (contact.phoneCountry) payload.phoneCountry = contact.phoneCountry
  }
  if (contact.email) payload.email = contact.email
  return Object.keys(payload).length > 0 ? payload : null
}

// Trocea la escritura en lotes: cada lote es su propia transacción atómica
// (lee cupo vigente + ofertas de lista de espera y escribe solo lo que
// entra). Ya no es por el margen de counterDeltaOk de firestore.rules (el
// Admin SDK no pasa por rules) sino para no abrir transacciones larguísimas
// ni con demasiadas escrituras en importaciones grandes — cada invitado
// puede escribir hasta 2 documentos (guest + contacto), así que 50
// invitados son come máximo 100 escrituras + 1 del contador, muy por debajo
// del límite de Firestore por transacción.
const CHUNK_SIZE = 50

async function createChunk(
  db: Firestore,
  eventRef: FirebaseFirestore.DocumentReference,
  eventId: string,
  chunk: GuestWrite[],
): Promise<{ createdIds: string[]; fitCount: number }> {
  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    const event = eventSnap.data() || {}
    const attendeeLimitEnabled = event.attendeeLimitEnabled as boolean | undefined

    // Solo se lee si hace falta (evento con cupo activado) — evita una
    // lectura de agregación de más en el caso, con mucho el más común, de un
    // evento sin límite de asistentes.
    let offeredCount = 0
    if (attendeeLimitEnabled === true) {
      const offeredAgg = await tx.get(
        eventRef.collection('waitlist').where('status', '==', 'offered').aggregate({ total: AggregateField.sum('partySize') }),
      )
      offeredCount = offeredAgg.data().total ?? 0
    }

    const currentGuestCount = typeof event.guestCount === 'number' ? event.guestCount : 0
    const currentPeopleCount = typeof event.peopleCount === 'number' ? event.peopleCount : currentGuestCount
    const remaining = remainingCapacity(
      { attendeeLimitEnabled, peopleCount: currentPeopleCount, capacity: event.capacity as number | undefined },
      offeredCount,
    )

    // null = cupo ilimitado, el lote entra completo. Si no, se suma
    // partySize en el orden recibido hasta donde alcance el cupo restante.
    let fitCount = chunk.length
    if (remaining !== null) {
      fitCount = 0
      let acc = 0
      for (const guest of chunk) {
        acc += partySizeOf(guest)
        if (acc > remaining) break
        fitCount++
      }
    }

    const fitting = chunk.slice(0, fitCount)
    const createdIds: string[] = []
    const guestsCol = eventRef.collection('guests')
    const contactsCol = eventRef.collection('guestContacts')
    let peopleDelta = 0

    for (const guest of fitting) {
      const guestRef = guestsCol.doc()
      tx.set(guestRef, buildGuestPayload(guest))
      const contactPayload = guest.contact ? buildContactPayload(guest.contact) : null
      if (contactPayload) tx.set(contactsCol.doc(guestRef.id), contactPayload)
      createdIds.push(guestRef.id)
      peopleDelta += partySizeOf(guest)
    }

    // buildGuestPayload siempre arranca en rsvpStatus 'pending' (auditoría
    // F22) — igual que el cliente hacía antes de esta migración.
    if (fitting.length > 0) {
      applyCounterDeltas(db, tx, eventRef, eventId, {
        guestCount: fitting.length,
        peopleCount: peopleDelta,
        rsvpPendingCount: fitting.length,
      })
    }

    return { createdIds, fitCount }
  })
}

// `mode: 'strict'` (addGuest, siempre un único invitado): si no entra, no
// crea nada y lanza CapacityFullError. `mode: 'best-fit'` (addGuestsBulk/
// addGuestsFromRows): crea los que entran, en el orden recibido, y devuelve
// el resto en `skipped` — nunca todo-o-nada.
export async function createGuestsWithCapacity(
  db: Firestore,
  eventId: string,
  guests: GuestWrite[],
  mode: 'strict' | 'best-fit',
): Promise<CreateGuestsResult> {
  const eventRef = db.collection('events').doc(eventId)
  const createdIds: string[] = []
  let cursor = 0
  while (cursor < guests.length) {
    const chunk = guests.slice(cursor, cursor + CHUNK_SIZE)
    const { createdIds: chunkIds, fitCount } = await createChunk(db, eventRef, eventId, chunk)
    createdIds.push(...chunkIds)
    cursor += fitCount
    if (fitCount < chunk.length) {
      if (mode === 'strict') throw new CapacityFullError()
      return { createdIds, skipped: guests.slice(cursor) }
    }
  }
  return { createdIds, skipped: [] }
}
