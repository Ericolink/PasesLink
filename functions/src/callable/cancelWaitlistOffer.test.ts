import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { cancelWaitlistOffer } from './cancelWaitlistOffer.js'

const OWNER_UID = 'owner-uid'

describe('cancelWaitlistOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('lets the owner cancel an active offer without re-offering it to the next candidate', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'offered-1', { status: 'offered', offerToken: 'token-1', partySize: 1, createdAt: 1000 })
    await seedWaitlistEntry(db, eventId, 'next-in-line', { createdAt: 2000, partySize: 1 })

    const result = await cancelWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'offered-1' }, OWNER_UID))

    expect(result).toEqual({ ok: true })
    const cancelled = await getWaitlistEntry(db, eventId, 'offered-1')
    expect(cancelled?.status).toBe('waiting')
    // La cascada automática está desactivada (ver onCapacityFreed.ts) — el
    // cupo liberado queda disponible para que el organizador lo asigne a
    // mano, no se le ofrece solo a la siguiente entrada de la fila.
    const next = await getWaitlistEntry(db, eventId, 'next-in-line')
    expect(next?.status).toBe('waiting')
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered' })

    await expect(
      cancelWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1' })),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a caller who is neither owner nor co-organizer', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered' })

    await expect(
      cancelWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, 'outsider-uid')),
    ).rejects.toThrow(HttpsError)
  })

  it('surfaces a clear error when the entry is no longer offered', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'waiting' })

    await expect(
      cancelWaitlistOffer.run(fakeCallableRequest({ eventId, entryId: 'entry-1' }, OWNER_UID)),
    ).rejects.toThrow('ya no está activa')
  })
})
