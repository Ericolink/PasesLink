import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { declineWaitlistOffer } from './declineWaitlistOffer.js'

describe('declineWaitlistOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks the offer declined without auto-offering the spot to the next person', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'declining', { status: 'offered', offerToken: 'token-1', offerExpiresAt: Date.now() + 60_000, partySize: 1 })
    await seedWaitlistEntry(db, eventId, 'next', { createdAt: 5000, partySize: 1 })

    const result = await declineWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'declining', offerToken: 'token-1' }))

    expect(result).toEqual({ ok: true })
    const declined = await getWaitlistEntry(db, eventId, 'declining')
    expect(declined?.status).toBe('declined')
    expect(declined?.respondedAt).toBeTruthy()

    // La cascada automática está desactivada (ver onCapacityFreed.ts) — el
    // organizador asigna el lugar liberado a mano desde el panel.
    const next = await getWaitlistEntry(db, eventId, 'next')
    expect(next?.status).toBe('waiting')
  })

  it('is a harmless no-op when the offer already resolved by another path', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'expired', offerToken: 'token-1', respondedAt: Date.now() })

    await expect(
      declineWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1', offerToken: 'token-1' })),
    ).resolves.toEqual({ ok: true })
  })
})
