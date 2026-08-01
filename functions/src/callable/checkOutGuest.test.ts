import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { checkInGuest } from './checkInGuest.js'
import { checkOutGuest } from './checkOutGuest.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

describe('checkOutGuest (Callable)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner check out a checked-in guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })
    await checkInGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN }, OWNER_UID))

    const result = await checkOutGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN, kind: 'temporary' }, OWNER_UID))

    expect(result).toMatchObject({ status: 'success', kind: 'temporary' })
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      checkOutGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN, kind: 'temporary' })),
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
      checkOutGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN, kind: 'temporary' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an invalid exit kind', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      checkOutGuest.run(fakeCallableRequest({ eventId, qrToken: QR_TOKEN, kind: 'forever' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent event', async () => {
    await expect(
      checkOutGuest.run(fakeCallableRequest({ eventId: uniqueId('event'), qrToken: QR_TOKEN, kind: 'temporary' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
