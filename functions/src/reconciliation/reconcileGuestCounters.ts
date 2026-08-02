// Reconciliador periódico de los contadores agregados de events/{eventId}
// que son 100% derivables de guests/{guestId} — ver
// BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §4.4 / FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md
// Fase D. `guestCount`/`peopleCount`/`paidCount`/`rsvpYesCount`/`rsvpNoCount`/
// `rsvpPendingCount` se mantienen con `increment()` disperso en ~12 sitios de
// escritura de guests.ts — este job recalcula la fuente de verdad desde cero
// y corrige drift, en vez de depender de que cada sitio nuevo incremente
// bien. Mismo criterio que ya usan scripts/backfill-paid-count.mjs y
// scripts/backfill-rsvp-counts.mjs, ahora automático y recurrente.
//
// A propósito NO incluye checkedInCount/occupancyCount: walkIn/walkOut
// (src/firebase/capacity.ts) los incrementan sin crear ningún documento de
// invitado, así que recalcularlos desde guests/ borraría esa porción —
// sería una regresión, no una corrección.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { partySizeFromRaw } from '../payments/confirmPayment.js'

export interface GuestCounters {
  guestCount: number
  peopleCount: number
  paidCount: number
  rsvpYesCount: number
  rsvpNoCount: number
  rsvpPendingCount: number
}

const EMPTY_COUNTERS: GuestCounters = {
  guestCount: 0,
  peopleCount: 0,
  paidCount: 0,
  rsvpYesCount: 0,
  rsvpNoCount: 0,
  rsvpPendingCount: 0,
}

function computeCounters(guests: DocumentData[]): GuestCounters {
  const counters = { ...EMPTY_COUNTERS }
  for (const guest of guests) {
    const partySize = partySizeFromRaw(guest.companions)
    counters.guestCount += 1
    counters.peopleCount += partySize
    if (guest.paymentStatus === 'paid') counters.paidCount += partySize
    if (guest.rsvpStatus === 'yes') counters.rsvpYesCount += 1
    else if (guest.rsvpStatus === 'no') counters.rsvpNoCount += 1
    else counters.rsvpPendingCount += 1
  }
  return counters
}

export interface ReconcileEventResult {
  changed: boolean
  before: GuestCounters
  after: GuestCounters
}

export async function reconcileEventGuestCounters(db: Firestore, eventId: string): Promise<ReconcileEventResult> {
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
  }
  const after = computeCounters(guestsSnap.docs.map((d) => d.data()))

  const changed = (Object.keys(after) as (keyof GuestCounters)[]).some((key) => before[key] !== after[key])
  if (changed) await eventRef.update({ ...after })

  return { changed, before, after }
}

export interface ReconcileAllResult {
  eventsChecked: number
  eventsUpdated: number
  updates: { eventId: string; before: GuestCounters; after: GuestCounters }[]
}

export async function reconcileAllGuestCounters(db: Firestore): Promise<ReconcileAllResult> {
  const eventsSnap = await db.collection('events').get()
  const result: ReconcileAllResult = { eventsChecked: 0, eventsUpdated: 0, updates: [] }

  for (const eventDoc of eventsSnap.docs) {
    result.eventsChecked += 1
    const { changed, before, after } = await reconcileEventGuestCounters(db, eventDoc.id)
    if (changed) {
      result.eventsUpdated += 1
      result.updates.push({ eventId: eventDoc.id, before, after })
    }
  }

  return result
}
