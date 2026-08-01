import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { getOfferedWaitlistCount } from './getOfferedWaitlistCount.js'

describe('getOfferedWaitlistCount', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('sums partySize across offered entries only', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'offered-1', { status: 'offered', partySize: 2 })
    await seedWaitlistEntry(db, eventId, 'offered-2', { status: 'offered', partySize: 3 })
    await seedWaitlistEntry(db, eventId, 'waiting-1', { status: 'waiting', partySize: 5 })

    const result = await getOfferedWaitlistCount.run(fakeCallableRequest({ eventId }))

    expect(result).toEqual({ count: 5 })
  })

  it('returns 0 when there are no offered entries', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await getOfferedWaitlistCount.run(fakeCallableRequest({ eventId }))

    expect(result).toEqual({ count: 0 })
  })
})
