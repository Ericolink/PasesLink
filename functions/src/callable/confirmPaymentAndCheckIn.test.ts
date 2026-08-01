import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { confirmPaymentAndCheckIn } from './confirmPaymentAndCheckIn.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

describe('confirmPaymentAndCheckIn (Callable)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner confirm payment and check in an unpaid guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, requiresPayment: true, checkedInCount: 0, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })

    const result = await confirmPaymentAndCheckIn.run(
      fakeCallableRequest({ eventId, guestId: 'guest-1', method: 'cash' }, OWNER_UID),
    )

    expect(result).toMatchObject({ ok: true, checkIn: 'success' })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.status).toBe('checked_in')
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      confirmPaymentAndCheckIn.run(fakeCallableRequest({ eventId, guestId: 'guest-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a co-organizer with scanQr but without confirmPayments', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { scanQr: true, confirmPayments: false } },
    })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      confirmPaymentAndCheckIn.run(fakeCallableRequest({ eventId, guestId: 'guest-1' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a co-organizer with confirmPayments but without scanQr', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { scanQr: false, confirmPayments: true } },
    })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      confirmPaymentAndCheckIn.run(fakeCallableRequest({ eventId, guestId: 'guest-1' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('lets a co-organizer with both scanQr and confirmPayments succeed', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      checkedInCount: 0,
      paidCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { scanQr: true, confirmPayments: true } },
    })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })

    const result = await confirmPaymentAndCheckIn.run(
      fakeCallableRequest({ eventId, guestId: 'guest-1', method: 'transfer' }, COORG_UID),
    )

    expect(result).toMatchObject({ ok: true, checkIn: 'success' })
  })

  it('rejects an invalid payment method', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      confirmPaymentAndCheckIn.run(fakeCallableRequest({ eventId, guestId: 'guest-1', method: 'bitcoin' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      confirmPaymentAndCheckIn.run(fakeCallableRequest({ eventId, guestId: 'ghost' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
