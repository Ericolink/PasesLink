import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { bulkSetGuestPaymentStatus } from './bulkSetGuestPaymentStatus.js'

const OWNER_UID = 'owner-uid'

describe('bulkSetGuestPaymentStatus', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('confirms payment for every guest in the selection', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid' })
    await seedGuest(db, eventId, 'guest-2', { paymentStatus: 'unpaid' })

    const result = await bulkSetGuestPaymentStatus.run(fakeCallableRequest({
      eventId, guestIds: ['guest-1', 'guest-2'], paymentStatus: 'paid', defaultMethod: 'cash',
    }, OWNER_UID))

    expect(result).toEqual({ ok: 2, failed: 0 })
    expect((await getGuestDoc(db, eventId, 'guest-1'))?.paymentStatus).toBe('paid')
    expect((await getGuestDoc(db, eventId, 'guest-2'))?.paymentStatus).toBe('paid')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })

  it('reports partial failures when some guestIds do not exist', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid' })

    const result = await bulkSetGuestPaymentStatus.run(fakeCallableRequest({
      eventId, guestIds: ['guest-1', 'ghost'], paymentStatus: 'paid',
    }, OWNER_UID))

    expect(result).toEqual({ ok: 1, failed: 1 })
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestIds: ['guest-1'], paymentStatus: 'paid' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller without confirmPayments permission', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { confirmPayments: false } },
    })

    await expect(
      bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestIds: ['guest-1'], paymentStatus: 'paid' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent event', async () => {
    await expect(
      bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId: uniqueId('event'), guestIds: ['guest-1'], paymentStatus: 'paid' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an empty guestIds array', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestIds: [], paymentStatus: 'paid' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('is idempotent across repeated calls', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', paymentMethod: 'cash' })

    await bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestIds: ['guest-1'], paymentStatus: 'paid' }, OWNER_UID))
    await bulkSetGuestPaymentStatus.run(fakeCallableRequest({ eventId, guestIds: ['guest-1'], paymentStatus: 'paid' }, OWNER_UID))

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(1)
  })
})
