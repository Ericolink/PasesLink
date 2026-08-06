import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import {
  commitReconciledCounters,
  reconcileAllGuestCounters,
  reconcileDirtyGuestCounters,
  reconcileEventGuestCounters,
  scanEventGuestCounters,
} from './reconcileGuestCounters.js'

describe('reconcileEventGuestCounters', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('recalculates guestCount/peopleCount from a mix of array and legacy-numeric companions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0, peopleCount: 0 })
    await seedGuest(db, eventId, 'guest-array', { companions: [{}, {}] }) // partySize 3
    await seedGuest(db, eventId, 'guest-legacy', { companions: 2 }) // partySize 3 (formato legacy)
    await seedGuest(db, eventId, 'guest-solo', { companions: [] }) // partySize 1

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(true)
    expect(result.after.guestCount).toBe(3)
    expect(result.after.peopleCount).toBe(7)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(3)
    expect(event.data()?.peopleCount).toBe(7)
  })

  it('recalculates paidCount summing partySize only for paid guests', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0 })
    await seedGuest(db, eventId, 'guest-paid', { companions: [{}], paymentStatus: 'paid' }) // partySize 2
    await seedGuest(db, eventId, 'guest-unpaid', { companions: [{}, {}], paymentStatus: 'unpaid' })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.after.paidCount).toBe(2)
  })

  it('recalculates the 3 rsvp counters', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {})
    await seedGuest(db, eventId, 'guest-yes', { rsvpStatus: 'yes' })
    await seedGuest(db, eventId, 'guest-no', { rsvpStatus: 'no' })
    await seedGuest(db, eventId, 'guest-pending-1', { rsvpStatus: 'pending' })
    await seedGuest(db, eventId, 'guest-pending-2', {}) // sin rsvpStatus -> cuenta como pendiente

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.after.rsvpYesCount).toBe(1)
    expect(result.after.rsvpNoCount).toBe(1)
    expect(result.after.rsvpPendingCount).toBe(2)
  })

  it('does not write anything when the stored counters already match', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 1, peopleCount: 1, paidCount: 0, rsvpYesCount: 0, rsvpNoCount: 0, rsvpPendingCount: 1 })
    await seedGuest(db, eventId, 'guest-1', { companions: [], rsvpStatus: 'pending' })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(false)
  })

  it('fixes real drift when a stored counter no longer matches the guests subcollection', async () => {
    const eventId = uniqueId('event')
    // Drift simulado: el evento quedó con paidCount desactualizado.
    await seedEvent(db, eventId, { guestCount: 1, peopleCount: 1, paidCount: 5 })
    await seedGuest(db, eventId, 'guest-1', { companions: [], paymentStatus: 'unpaid' })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(true)
    expect(result.before.paidCount).toBe(5)
    expect(result.after.paidCount).toBe(0)
  })

  it('recomputes occupancyCount/checkedInCount as guest-derived + walkInNetCount (walk-ins not touched)', async () => {
    const eventId = uniqueId('event')
    // 2 personas walk-in (ledger) + 1 invitado identificado adentro (party 2)
    // + 1 invitado que ya salió (cuenta para checkedInCount pero no occupancyCount).
    await seedEvent(db, eventId, { checkedInCount: 0, occupancyCount: 0, walkInNetCount: 2 })
    await seedGuest(db, eventId, 'guest-inside', { companions: [{}], status: 'checked_in', checkedOutAt: null })
    await seedGuest(db, eventId, 'guest-left', { companions: [], status: 'checked_in', checkedOutAt: Date.now(), exitType: 'temporary' })
    await seedGuest(db, eventId, 'guest-never-in', { companions: [], status: 'invited' })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(true)
    // checkedInCount = (2 personas adentro + 1 que ya salió) + 2 walk-ins = 5
    expect(result.after.checkedInCount).toBe(5)
    // occupancyCount = solo la que sigue adentro (2) + 2 walk-ins = 4
    expect(result.after.occupancyCount).toBe(4)
  })

  it('does not touch checkedInCount/occupancyCount when they already match (walk-in portion preserved)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      guestCount: 1, peopleCount: 1, checkedInCount: 3, occupancyCount: 3, walkInNetCount: 3, rsvpPendingCount: 1,
    })
    await seedGuest(db, eventId, 'guest-1', { companions: [], status: 'invited' })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(false)
  })

  it('is idempotent: running twice in a row only writes once', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0, peopleCount: 0, paidCount: 5 })
    await seedGuest(db, eventId, 'guest-1', { companions: [], paymentStatus: 'unpaid' })

    const first = await reconcileEventGuestCounters(db, eventId)
    const second = await reconcileEventGuestCounters(db, eventId)

    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
  })

  it('clears a stale countersDirty flag even when no drift is found', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      guestCount: 1, peopleCount: 1, rsvpPendingCount: 1, countersDirty: true, countersDirtyAt: FieldValue.serverTimestamp(),
    })
    await seedGuest(db, eventId, 'guest-1', { companions: [] })

    const result = await reconcileEventGuestCounters(db, eventId)

    expect(result.changed).toBe(false) // nada de contadores cambió
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.countersDirty).toBe(false)
  })

  it('skips the write when a guest write races in between the scan and the commit (guard by countersDirtyAt)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { guestCount: 0, peopleCount: 0, paidCount: 5, countersDirtyAt: FieldValue.serverTimestamp() })
    await seedGuest(db, eventId, 'guest-1', { companions: [], paymentStatus: 'unpaid' })

    const scan = await scanEventGuestCounters(db, eventId)
    expect(scan.changed).toBe(true) // paidCount pasaría de 5 a 0

    // Simula la escritura concurrente que el trigger onGuestWritten haría al
    // vuelo de un guest write real: avanza countersDirtyAt DESPUÉS del scan.
    await db.collection('events').doc(eventId).set(
      { countersDirty: true, countersDirtyAt: FieldValue.serverTimestamp() },
      { merge: true },
    )

    const result = await commitReconciledCounters(db, eventId, scan)

    expect(result.changed).toBe(false) // se abstuvo de escribir el resultado ya obsoleto
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(5) // sin tocar — la próxima corrida (countersDirty sigue true) lo recalcula
    expect(event.data()?.countersDirty).toBe(true)
  })
})

describe('reconcileDirtyGuestCounters', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('only processes events flagged countersDirty and clears the flag after fixing them', async () => {
    const dirtyEventId = uniqueId('event')
    const cleanEventId = uniqueId('event')
    await seedEvent(db, dirtyEventId, { guestCount: 0, peopleCount: 0, countersDirty: true, countersDirtyAt: FieldValue.serverTimestamp() })
    await seedGuest(db, dirtyEventId, 'guest-1', { companions: [] })
    // No está marcado dirty — no debería tocarse aunque también tenga drift.
    await seedEvent(db, cleanEventId, { guestCount: 0, peopleCount: 0 })
    await seedGuest(db, cleanEventId, 'guest-1', { companions: [] })

    const result = await reconcileDirtyGuestCounters(db)

    expect(result.eventsChecked).toBe(1)
    expect(result.updates.map((u) => u.eventId)).toEqual([dirtyEventId])
    const dirtyEvent = await db.collection('events').doc(dirtyEventId).get()
    expect(dirtyEvent.data()?.guestCount).toBe(1)
    expect(dirtyEvent.data()?.countersDirty).toBe(false)
    const cleanEvent = await db.collection('events').doc(cleanEventId).get()
    expect(cleanEvent.data()?.guestCount).toBe(0) // sin marca, sin tocar
  })
})

describe('reconcileAllGuestCounters', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('processes every event and only reports the ones that actually changed', async () => {
    const driftedEventId = uniqueId('event')
    const cleanEventId = uniqueId('event')
    await seedEvent(db, driftedEventId, { guestCount: 0, peopleCount: 0 })
    await seedGuest(db, driftedEventId, 'guest-1', { companions: [] })
    await seedEvent(db, cleanEventId, { guestCount: 1, peopleCount: 1, paidCount: 0, rsvpYesCount: 0, rsvpNoCount: 0, rsvpPendingCount: 1 })
    await seedGuest(db, cleanEventId, 'guest-1', { companions: [], rsvpStatus: 'pending' })

    const result = await reconcileAllGuestCounters(db)

    expect(result.eventsChecked).toBe(2)
    expect(result.eventsUpdated).toBe(1)
    expect(result.updates.map((u) => u.eventId)).toEqual([driftedEventId])
  })
})
