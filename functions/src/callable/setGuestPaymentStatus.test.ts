import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { setGuestPaymentStatus } from './setGuestPaymentStatus.js'

const OWNER_UID = 'owner-uid'

describe('setGuestPaymentStatus', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner confirm a payment', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', companions: [{}] })

    const result = await setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid', method: 'cash' }, OWNER_UID))

    expect(result).toEqual({ ok: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.paidBy).toBe(OWNER_UID)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1')

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1')

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid' }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a co-organizer without the confirmPayments permission', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { confirmPayments: false } },
    })
    await seedGuest(db, eventId, 'guest-1')

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('lets a co-organizer with confirmPayments confirm a payment', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      paidCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { confirmPayments: true } },
    })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid' })

    const result = await setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid' }, COORG_UID))

    expect(result).toEqual({ ok: true })
  })

  it('rejects a nonexistent event', async () => {
    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId: uniqueId('event'), guestId: 'guest-1', paymentStatus: 'paid' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'ghost', paymentStatus: 'paid' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a guest that belongs to a different event', async () => {
    const eventA = uniqueId('event')
    const eventB = uniqueId('event')
    await seedEvent(db, eventA, { ownerId: OWNER_UID })
    await seedEvent(db, eventB, { ownerId: OWNER_UID })
    await seedGuest(db, eventA, 'guest-1', { paymentStatus: 'unpaid' })

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId: eventB, guestId: 'guest-1', paymentStatus: 'paid' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects missing required fields', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      setGuestPaymentStatus.run(fakeCallableRequest({ eventId }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('is idempotent: confirming an already-paid guest twice does not double-count paidCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', paymentMethod: 'cash', companions: [{}] })

    await setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid', method: 'cash' }, OWNER_UID))
    await setGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestId: 'guest-1', paymentStatus: 'paid', method: 'cash' }, OWNER_UID))

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })
})
