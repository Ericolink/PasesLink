import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { cancelOffer } from './promote.js'

describe('cancelOffer', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('reverts an offered entry back to waiting, keeping its queue position', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', {
      status: 'offered', offerToken: 'token-1', priorityBoost: 3, createdAt: 1000,
    })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: true })
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
    expect(entry?.offerToken).toBeNull()
    expect(entry?.promotionReason).toBeNull()
    // No fue elección del invitado — conserva su lugar en la fila.
    expect(entry?.priorityBoost).toBe(3)
    expect(entry?.createdAt).toBe(1000)
  })

  it('rejects cancelling an entry that is not currently offered', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'waiting' })

    const result = await cancelOffer(db, eventId, 'entry-1')

    expect(result).toEqual({ ok: false, reason: 'not_offered' })
  })

  it('rejects a missing entry', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await cancelOffer(db, eventId, 'does-not-exist')

    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
