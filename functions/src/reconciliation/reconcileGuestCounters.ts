// Reconciliador de los contadores agregados de events/{eventId} — ver
// BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §4.4 / FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md
// Fase D. `guestCount`/`peopleCount`/`paidCount`/`rsvpYesCount`/`rsvpNoCount`/
// `rsvpPendingCount`/`checkedInCount`/`occupancyCount` se mantienen con
// `increment()` disperso en ~12 sitios de escritura de guests.ts (más
// walkIn/walkOut en capacity.ts) — este módulo recalcula la fuente de verdad
// desde cero y corrige drift, en vez de depender de que cada sitio nuevo
// incremente bien. Mismo criterio que ya usaban scripts/backfill-paid-count.mjs
// y scripts/backfill-rsvp-counts.mjs (retirados, ver git log), ahora
// automático y recurrente vía dos entradas (ver scheduled/):
// - reconcileDirtyGuestCounters: barrido liviano y frecuente, solo eventos
//   marcados countersDirty por el trigger onGuestWritten (cada escritura de
//   guests/{guestId} marca a su evento).
// - reconcileGuestCounters: barrido completo, poco frecuente, red de
//   seguridad final por si el mecanismo de dirty-flag se pierde algo.
//
// checkedInCount/occupancyCount SÍ entran en esta reconciliación (a
// diferencia de una iteración anterior que los excluía) gracias a
// walkInNetCount (src/firebase/capacity.ts, ver counters/config.ts): la
// porción de esos dos contadores que corresponde a invitados identificados
// se recalcula desde guests/ (reusando guestPresence, misma máquina de
// estados que checkin/shared.ts), y la porción de walk-ins (que no crean
// documento de invitado, así que no es derivable de guests/) se toma tal
// cual de ese ledger — la única fuente de verdad posible para esa parte.
import type { DocumentData, Firestore, Timestamp } from 'firebase-admin/firestore'
import { guestPresence } from '../checkin/shared.js'
import { partySizeFromRaw } from '../payments/confirmPayment.js'

export interface GuestCounters {
  guestCount: number
  peopleCount: number
  paidCount: number
  rsvpYesCount: number
  rsvpNoCount: number
  rsvpPendingCount: number
  checkedInCount: number
  occupancyCount: number
}

const EMPTY_COUNTERS: GuestCounters = {
  guestCount: 0,
  peopleCount: 0,
  paidCount: 0,
  rsvpYesCount: 0,
  rsvpNoCount: 0,
  rsvpPendingCount: 0,
  checkedInCount: 0,
  occupancyCount: 0,
}

function computeCounters(guests: DocumentData[], walkInNetCount: number): GuestCounters {
  const counters = { ...EMPTY_COUNTERS }
  let checkedInCumulative = 0
  let currentlyInside = 0
  for (const guest of guests) {
    const partySize = partySizeFromRaw(guest.companions)
    counters.guestCount += 1
    counters.peopleCount += partySize
    if (guest.paymentStatus === 'paid') counters.paidCount += partySize
    if (guest.rsvpStatus === 'yes') counters.rsvpYesCount += 1
    else if (guest.rsvpStatus === 'no') counters.rsvpNoCount += 1
    else counters.rsvpPendingCount += 1
    // status queda en 'checked_in' para siempre tras la primera entrada
    // (checkOutGuest no lo revierte, ver checkin/shared.ts) — por eso suma
    // "asistencia acumulada" en vez de presencia actual.
    if (guest.status === 'checked_in') checkedInCumulative += partySize
    if (guestPresence(guest) === 'inside') currentlyInside += partySize
  }
  counters.checkedInCount = checkedInCumulative + walkInNetCount
  counters.occupancyCount = currentlyInside + walkInNetCount
  return counters
}

export interface ReconcileEventResult {
  changed: boolean
  before: GuestCounters
  after: GuestCounters
}

function dirtyMarkersEqual(a: Timestamp | null, b: Timestamp | null): boolean {
  if (a === null || b === null) return a === b
  return a.isEqual(b)
}

export interface ScanResult {
  before: GuestCounters
  after: GuestCounters
  changed: boolean
  baselineDirtyAt: Timestamp | null
  wasDirty: boolean
}

/** Lee events/{eventId} + TODA guests/ y recalcula los contadores — sin escribir nada. Separado de commitReconciledCounters para poder probar el guard de concurrencia de forma determinística (ver ese archivo de test). */
export async function scanEventGuestCounters(db: Firestore, eventId: string): Promise<ScanResult> {
  const eventRef = db.collection('events').doc(eventId)
  const [eventSnap, guestsSnap] = await Promise.all([eventRef.get(), eventRef.collection('guests').get()])

  const eventData = eventSnap.data() ?? {}
  const before: GuestCounters = {
    guestCount: (eventData.guestCount as number) ?? 0,
    peopleCount: (eventData.peopleCount as number) ?? 0,
    paidCount: (eventData.paidCount as number) ?? 0,
    rsvpYesCount: (eventData.rsvpYesCount as number) ?? 0,
    rsvpNoCount: (eventData.rsvpNoCount as number) ?? 0,
    rsvpPendingCount: (eventData.rsvpPendingCount as number) ?? 0,
    checkedInCount: (eventData.checkedInCount as number) ?? 0,
    occupancyCount: (eventData.occupancyCount as number) ?? 0,
  }
  const walkInNetCount = (eventData.walkInNetCount as number) ?? 0
  const after = computeCounters(guestsSnap.docs.map((d) => d.data()), walkInNetCount)
  const baselineDirtyAt = (eventData.countersDirtyAt as Timestamp | undefined) ?? null
  const wasDirty = eventData.countersDirty === true
  const changed = (Object.keys(after) as (keyof GuestCounters)[]).some((key) => before[key] !== after[key])

  return { before, after, changed, baselineDirtyAt, wasDirty }
}

/**
 * Escribe (si hace falta) el resultado de un scan previo. Segura ante
 * concurrencia: va dentro de una transacción que vuelve a leer
 * `countersDirtyAt` — si cambió desde que se hizo el scan (es decir, hubo
 * una escritura de invitado en el medio), se aborta sin escribir nada en vez
 * de pisar ese cambio con datos ya obsoletos; el propio trigger que causó
 * ese cambio ya dejó el evento marcado dirty, así que la próxima corrida lo
 * vuelve a tomar (converge solo, sin pérdida de datos). Idempotente: si los
 * contadores ya son correctos y no había nada dirty que limpiar, no escribe
 * nada.
 */
export async function commitReconciledCounters(db: Firestore, eventId: string, scan: ScanResult): Promise<ReconcileEventResult> {
  const { before, after, changed, baselineDirtyAt, wasDirty } = scan
  if (!changed && !wasDirty) return { changed, before, after }

  const eventRef = db.collection('events').doc(eventId)
  let written = false
  await db.runTransaction(async (tx) => {
    const liveSnap = await tx.get(eventRef)
    const liveDirtyAt = (liveSnap.data()?.countersDirtyAt as Timestamp | undefined) ?? null
    if (!dirtyMarkersEqual(baselineDirtyAt, liveDirtyAt)) return // escritura concurrente desde el scan — dejar para la próxima corrida

    const patch: Record<string, unknown> = {}
    if (changed) Object.assign(patch, after)
    if (wasDirty) patch.countersDirty = false
    if (Object.keys(patch).length === 0) return
    tx.update(eventRef, patch)
    written = changed
  })

  return { changed: written, before, after }
}

/** Recalcula y (si hace falta) corrige los contadores de un evento — ver scanEventGuestCounters/commitReconciledCounters para el detalle de cada paso. */
export async function reconcileEventGuestCounters(db: Firestore, eventId: string): Promise<ReconcileEventResult> {
  const scan = await scanEventGuestCounters(db, eventId)
  return commitReconciledCounters(db, eventId, scan)
}

export interface ReconcileBatchResult {
  eventsChecked: number
  eventsUpdated: number
  updates: { eventId: string; before: GuestCounters; after: GuestCounters }[]
}

async function reconcileEvents(db: Firestore, eventIds: string[]): Promise<ReconcileBatchResult> {
  const result: ReconcileBatchResult = { eventsChecked: 0, eventsUpdated: 0, updates: [] }
  for (const eventId of eventIds) {
    result.eventsChecked += 1
    const { changed, before, after } = await reconcileEventGuestCounters(db, eventId)
    if (changed) {
      result.eventsUpdated += 1
      result.updates.push({ eventId, before, after })
    }
  }
  return result
}

/** Barrido completo — recorre TODOS los eventos, sin importar countersDirty. Red de seguridad final, pensada para correr poco frecuente (ver scheduled/reconcileGuestCounters.ts). */
export async function reconcileAllGuestCounters(db: Firestore): Promise<ReconcileBatchResult> {
  const eventsSnap = await db.collection('events').get()
  return reconcileEvents(db, eventsSnap.docs.map((d) => d.id))
}

/** Barrido liviano — solo eventos marcados countersDirty por onGuestWritten. Pensado para correr frecuente (ver scheduled/reconcileDirtyGuestCounters.ts). */
export async function reconcileDirtyGuestCounters(db: Firestore, limit = 200): Promise<ReconcileBatchResult> {
  const dirtySnap = await db.collection('events').where('countersDirty', '==', true).limit(limit).get()
  return reconcileEvents(db, dirtySnap.docs.map((d) => d.id))
}
