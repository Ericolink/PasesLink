import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestContactsDoc, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { addGuestsFromRows } from './addGuestsFromRows.js'

const OWNER_UID = 'owner-uid'

describe('addGuestsFromRows', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates guest + contact docs from CSV rows and updates counters', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0, peopleCount: 0 })

    const result = await addGuestsFromRows.run(fakeCallableRequest({
      eventId,
      rows: [
        { name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333', email: 'juan@test.com' },
        { name: 'María', lastName: 'López' },
      ],
    }, OWNER_UID))

    expect(result).toEqual({ added: 2, skippedNames: [] })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(2)
    expect(event.data()?.peopleCount).toBe(2)
  })

  it('lowercases the email so it matches a verified account email later', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await addGuestsFromRows.run(fakeCallableRequest({
      eventId, rows: [{ name: 'Ana', email: 'ANA@TEST.COM' }],
    }, OWNER_UID))

    const guestId = (await db.collection('events').doc(eventId).collection('guests').get()).docs[0].id
    expect(result.added).toBe(1)
    const contact = await getGuestContactsDoc(db, eventId, guestId)
    expect(contact?.email).toBe('ana@test.com')
  })

  it('lets a co-organizer with addGuests (but not editGuests) import rows with phone/email', async () => {
    const COORG_UID = 'coorg-csv-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      guestCount: 0,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: true, editGuests: false } },
    })

    const result = await addGuestsFromRows.run(fakeCallableRequest({
      eventId, rows: [{ name: 'Ana', lastName: 'Gómez', phone: '11-4444-5555' }],
    }, COORG_UID))

    expect(result.added).toBe(1)
  })

  it('fills only what fits and reports the rest as skipped once capacity runs out', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 5, guestCount: 4, peopleCount: 4 })

    const result = await addGuestsFromRows.run(fakeCallableRequest({
      eventId, rows: [{ name: 'Ana' }, { name: 'Beto' }],
    }, OWNER_UID))

    expect(result.added).toBe(1)
    expect(result.skippedNames).toEqual(['Beto'])
  })

  it('rejects an invalid email format, creating nothing', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0 })

    await expect(
      addGuestsFromRows.run(fakeCallableRequest({
        eventId, rows: [{ name: 'Ana', email: 'not-an-email' }],
      }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(0)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      addGuestsFromRows.run(fakeCallableRequest({ eventId, rows: [{ name: 'Ana' }] })),
    ).rejects.toThrow(HttpsError)
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
      addGuestsFromRows.run(fakeCallableRequest({ eventId, rows: [{ name: 'Ana' }] }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects an empty rows array', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      addGuestsFromRows.run(fakeCallableRequest({ eventId, rows: [] }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
