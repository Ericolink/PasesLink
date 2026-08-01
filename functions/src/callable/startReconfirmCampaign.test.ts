import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { startReconfirmCampaign } from './startReconfirmCampaign.js'

const OWNER_UID = 'owner-uid'

describe('startReconfirmCampaign', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner start a campaign', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await startReconfirmCampaign.run(fakeCallableRequest({
      eventId, deadline: Date.now() + 86_400_000, reminderRules: [],
    }, OWNER_UID))

    expect(result).toEqual({ targeted: 0 })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.reconfirmCampaign).toBeTruthy()
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      startReconfirmCampaign.run(fakeCallableRequest({ eventId, deadline: Date.now(), reminderRules: [] })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      startReconfirmCampaign.run(fakeCallableRequest({ eventId, deadline: Date.now(), reminderRules: [] }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects missing required fields', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      startReconfirmCampaign.run(fakeCallableRequest({ eventId }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })
})
