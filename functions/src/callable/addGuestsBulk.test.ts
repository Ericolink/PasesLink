import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { addGuestsBulk } from './addGuestsBulk.js'

const OWNER_UID = 'owner-uid'

describe('addGuestsBulk', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates every guest and updates counters when there is room', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0, peopleCount: 0 })

    const result = await addGuestsBulk.run(fakeCallableRequest({ eventId, names: ['Juan Pérez', 'María López'] }, OWNER_UID))

    expect(result).toEqual({ added: 2, skippedNames: [] })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(2)
    expect(event.data()?.peopleCount).toBe(2)
  })

  it('fills only what fits and reports the rest as skipped once capacity runs out', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 200, guestCount: 198, peopleCount: 198 })

    const result = await addGuestsBulk.run(fakeCallableRequest({
      eventId, names: ['Ana', 'Beto', 'Caro', 'Dani', 'Eli'],
    }, OWNER_UID))

    expect(result).toEqual({ added: 2, skippedNames: ['Caro', 'Dani', 'Eli'] })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(200)
  })

  it('lets a co-organizer with addGuests bulk-add more than 50 names in one call (issue #91)', async () => {
    const COORG_UID = 'coorg-bulk-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      attendeeLimitEnabled: false,
      guestCount: 0,
      peopleCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: true, editGuests: false } },
    })
    const names = Array.from({ length: 120 }, (_, i) => `Invitado ${i}`)

    const result = await addGuestsBulk.run(fakeCallableRequest({ eventId, names }, COORG_UID))

    expect(result).toEqual({ added: 120, skippedNames: [] })
  })

  it('creates nothing when a single name in the list is invalid', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0 })

    await expect(
      addGuestsBulk.run(fakeCallableRequest({ eventId, names: ['Ana', ''] }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(0)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(addGuestsBulk.run(fakeCallableRequest({ eventId, names: ['Ana'] }))).rejects.toThrow(HttpsError)
  })

  it('rejects a caller without addGuests permission', async () => {
    const COORG_UID = 'coorg-noadd-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: false } },
    })

    await expect(
      addGuestsBulk.run(fakeCallableRequest({ eventId, names: ['Ana'] }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an empty names array', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      addGuestsBulk.run(fakeCallableRequest({ eventId, names: [] }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
