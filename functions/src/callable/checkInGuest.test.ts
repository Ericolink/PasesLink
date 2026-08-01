import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { checkInGuest } from './checkInGuest.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

describe('checkInGuest (Callable)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner check in a guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    const result = await checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN }, OWNER_UID))

    expect(result).toMatchObject({ status: 'success' })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.status).toBe('checked_in')
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a co-organizer without the scanQr permission', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { scanQr: false } },
    })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await expect(
      checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('lets a co-organizer with scanQr check in a guest', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      checkedInCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { scanQr: true } },
    })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    const result = await checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN }, COORG_UID))

    expect(result).toMatchObject({ status: 'success' })
  })

  it('rejects a nonexistent event', async () => {
    await expect(
      checkInGuest.run(fakeCallableRequest({ eventId: uniqueId('event'), qrToken: QR_TOKEN }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects missing required fields', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      checkInGuest.run(fakeCallableRequest({ eventId }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('resolves with not_found for an unknown qrToken instead of throwing', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await checkInGuest.run(fakeCallableRequest({ eventId, qrToken: 'no-such-token' }, OWNER_UID))

    expect(result).toEqual({ status: 'not_found' })
  })
})
