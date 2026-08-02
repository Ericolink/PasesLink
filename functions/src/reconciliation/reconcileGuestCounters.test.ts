import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { reconcileAllGuestCounters, reconcileEventGuestCounters } from './reconcileGuestCounters.js'

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
