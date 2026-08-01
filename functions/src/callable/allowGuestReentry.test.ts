import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { allowGuestReentry } from './allowGuestReentry.js'

const OWNER_UID = 'owner-uid'

describe('allowGuestReentry (Callable)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner clear exitType for a guest that exited definitively', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1', { status: 'checked_in', checkedOutAt: Date.now(), exitType: 'final' })

    const result = await allowGuestReentry.run(fakeCallableRequest({ eventId, guestId: 'guest-1' }, OWNER_UID))

    expect(result).toEqual({ ok: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.exitType).toBe(null)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedGuest(db, eventId, 'guest-1')

    await expect(
      allowGuestReentry.run(fakeCallableRequest({ eventId, guestId: 'guest-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a co-organizer without the editGuests permission', async () => {
    const eventId = uniqueId('event')
    const COORG_UID = 'coorg-uid'
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { editGuests: false } },
    })
    await seedGuest(db, eventId, 'guest-1')

    await expect(
      allowGuestReentry.run(fakeCallableRequest({ eventId, guestId: 'guest-1' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      allowGuestReentry.run(fakeCallableRequest({ eventId, guestId: 'ghost' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
