import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, getWaitlistEntry, seedEvent, seedGuest, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { assignWaitlistSpot } from './assignWaitlistSpot.js'

const OWNER_UID = 'owner-uid'

describe('assignWaitlistSpot', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('promotes a waiting entry to a confirmed guest instantly, no offer involved', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 5, guestCount: 5, rsvpYesCount: 5 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { name: 'Juan Pérez', partySize: 2, email: 'juan@test.com' })

    const result = await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID))

    expect(result.qrToken).toBeTruthy()

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('promoted')
    expect(entry?.promotedGuestId).toBeTruthy()
    // Nunca pasó por 'offered' — offerToken sigue en null.
    expect(entry?.offerToken).toBeNull()

    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.data()?.peopleCount).toBe(7)
    expect(eventSnap.data()?.guestCount).toBe(6)

    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.name).toBe('Juan Pérez')
    expect(guestSnap.data()?.companions).toBe(1)
    expect(guestSnap.data()?.rsvpStatus).toBe('yes')
    // El organizador asigna, no es el invitado quien confirma su sesión.
    expect(guestSnap.data()?.guestUid).toBeNull()
  })

  it('also promotes an entry that already has a pending offer (overrides it)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'stale-token' })

    const result = await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID))

    expect(result.qrToken).toBeTruthy()
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('promoted')
  })

  it('rejects an entry that was already promoted', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'promoted', promotedGuestId: 'some-guest' })

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a removed entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'removed' })

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('does not exceed capacity — rejects a party that no longer fits', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 5, peopleCount: 4 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 2 })

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.data()?.peopleCount).toBe(4)
  })

  it('bumps the most recently registered eligible guest to the waitlist when the event is full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 2, peopleCount: 2, guestCount: 2, rsvpYesCount: 2 })
    await seedGuest(db, eventId, 'guest-old', { name: 'Ana', createdAt: 1000, rsvpStatus: 'yes' })
    await seedGuest(db, eventId, 'guest-new', { name: 'Beto', createdAt: 2000, rsvpStatus: 'yes' })
    await seedWaitlistEntry(db, eventId, 'entry-1', { name: 'Carla', partySize: 1 })

    const result = await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID))

    expect(result.qrToken).toBeTruthy()
    expect(result.bumped).toEqual([{ name: 'Beto', partySize: 1 }])

    // El más viejo (Ana) queda intacto; el más nuevo (Beto) se corrió.
    expect(await getGuestDoc(db, eventId, 'guest-old')).toBeTruthy()
    expect(await getGuestDoc(db, eventId, 'guest-new')).toBeUndefined()

    const eventSnap = await db.collection('events').doc(eventId).get()
    // Entra Carla, sale Beto: peopleCount neto sin cambios.
    expect(eventSnap.data()?.peopleCount).toBe(2)
    expect(eventSnap.data()?.guestCount).toBe(2)
    expect(eventSnap.data()?.rsvpYesCount).toBe(2)

    const waitlistSnap = await db.collection('events').doc(eventId).collection('waitlist').get()
    const bumpedEntry = waitlistSnap.docs.find((d) => d.data().name === 'Beto')
    expect(bumpedEntry?.data().status).toBe('waiting')
  })

  it('never bumps a guest who already paid or checked in, even if more recent', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 2, peopleCount: 2, guestCount: 2, rsvpYesCount: 2 })
    await seedGuest(db, eventId, 'guest-paid', { name: 'Diego', createdAt: 2000, paymentStatus: 'paid' })
    await seedGuest(db, eventId, 'guest-checkedin', { name: 'Elena', createdAt: 3000, status: 'checked_in' })
    await seedWaitlistEntry(db, eventId, 'entry-1', { name: 'Fabio', partySize: 1 })

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)

    expect(await getGuestDoc(db, eventId, 'guest-paid')).toBeTruthy()
    expect(await getGuestDoc(db, eventId, 'guest-checkedin')).toBeTruthy()
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
  })

  it('bumps more than one guest when the arriving party needs more than one spot', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 2, peopleCount: 2, guestCount: 2, rsvpYesCount: 2 })
    await seedGuest(db, eventId, 'guest-a', { name: 'Gina', createdAt: 1000 })
    await seedGuest(db, eventId, 'guest-b', { name: 'Hugo', createdAt: 2000 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { name: 'Iris', partySize: 2 })

    const result = await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID))

    expect(result.bumped.map((b) => b.name).sort()).toEqual(['Gina', 'Hugo'])
    expect(await getGuestDoc(db, eventId, 'guest-a')).toBeUndefined()
    expect(await getGuestDoc(db, eventId, 'guest-b')).toBeUndefined()
    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.data()?.peopleCount).toBe(2)
    expect(eventSnap.data()?.guestCount).toBe(1)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('respects the chosen payment method when the event requires payment', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0, requiresPayment: true })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1', paymentMethod: 'cash' }, OWNER_UID))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.paymentMethod).toBe('cash')
  })

  it('markPaid: creates the guest already paid, in the same transaction, when there is capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0, requiresPayment: true, paymentMethods: ['cash', 'transfer'] })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 2 })

    const result = await assignWaitlistSpot.run(
      fakeCallableRequest({ eventId, entryId: 'entry-1', paymentMethod: 'cash', markPaid: true }, OWNER_UID),
    )
    expect(result.qrToken).toBeTruthy()

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.paymentStatus).toBe('paid')
    expect(guestSnap.data()?.paymentMethod).toBe('cash')
    expect(guestSnap.data()?.paidBy).toBe(OWNER_UID)
    expect(typeof guestSnap.data()?.paidAt).toBe('number')

    // Nunca duplica el guest, y los contadores solo se movieron una vez.
    const guestsSnap = await db.collection('events').doc(eventId).collection('guests').get()
    expect(guestsSnap.docs).toHaveLength(1)
    const eventSnap = await db.collection('events').doc(eventId).get()
    expect(eventSnap.data()?.peopleCount).toBe(2)
  })

  it('markPaid: still rejected when the event is full — never bypasses capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 5, peopleCount: 4, requiresPayment: true })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 2 })

    await expect(
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1', paymentMethod: 'cash', markPaid: true }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
    const guestsSnap = await db.collection('events').doc(eventId).collection('guests').get()
    expect(guestsSnap.docs).toHaveLength(0)
  })

  it('markPaid: ignored when the event does not require payment (guest is not marked paid)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0, requiresPayment: false })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1', markPaid: true }, OWNER_UID))

    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    const guestSnap = await db.collection('events').doc(eventId).collection('guests').doc(entry!.promotedGuestId as string).get()
    expect(guestSnap.data()?.paymentStatus).toBe('unpaid')
  })

  it('never lets two concurrent direct assignments of the same entry both create a guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const results = await Promise.allSettled([
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const guestsSnap = await db.collection('events').doc(eventId).collection('guests').get()
    expect(guestsSnap.docs).toHaveLength(1)
  })

  it('never lets a direct assignment and an offer confirmation double-book the same entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', offerToken: 'token-1' })

    const [{ confirmWaitlistOffer }] = await Promise.all([import('./confirmWaitlistOffer.js')])

    const results = await Promise.allSettled([
      assignWaitlistSpot.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
      confirmWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
    ])

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    const guestsSnap = await db.collection('events').doc(eventId).collection('guests').get()
    expect(guestsSnap.docs).toHaveLength(1)
  })
})
