import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { promoteWaitlistEntry } from './promoteWaitlistEntry.js'

const OWNER_UID = 'owner-uid'

describe('promoteWaitlistEntry', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner promote an entry out of order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'first', { createdAt: 1000 })
    await seedWaitlistEntry(db, eventId, 'picked-manually', { createdAt: 2000 })

    const result = await promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'picked-manually' }, OWNER_UID))

    expect(result.ok).toBe(true)
    const picked = await getWaitlistEntry(db, eventId, 'picked-manually')
    expect(picked?.status).toBe('offered')
    expect(picked?.promotionReason).toBe('manual')
    const first = await getWaitlistEntry(db, eventId, 'first')
    expect(first?.status).toBe('waiting')
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await expect(
      promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'entry-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await expect(
      promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('allows a co-organizer with addGuests permission (default true, no explicit entry)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID, capacity: 10, peopleCount: 0,
      coOrganizersMap: { 'coorg-uid': true },
    })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const result = await promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, 'coorg-uid'))

    expect(result.ok).toBe(true)
  })

  it('rejects a co-organizer whose addGuests permission was explicitly revoked', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { 'coorg-uid': true },
      coOrganizerPermissions: { 'coorg-uid': { addGuests: false } },
    })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    await expect(
      promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, 'coorg-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('surfaces a clear reason when the entry cannot be promoted', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 5, peopleCount: 5 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { partySize: 1 })

    await expect(
      promoteWaitlistEntry.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow('No hay lugar suficiente')
  })
})
