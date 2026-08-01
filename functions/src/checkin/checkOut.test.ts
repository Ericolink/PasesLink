import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { checkInGuest } from './checkIn.js'
import { checkOutGuest } from './checkOut.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

describe('checkOutGuest (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('returns not_checked_in when checking out a guest without a prior check-in', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    const result = await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')

    expect(result.status).toBe('not_checked_in')
  })

  it('rejects a double check-out for the same guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const first = await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(first.status).toBe('success')

    const second = await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(second.status).toBe('already_checked_out')
  })

  it('never decrements checkedInCount on exit, only occupancyCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0, occupancyCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'final')

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(1)
    expect(event.data()?.occupancyCount).toBe(0)
  })

  it('returns not_found for an unknown qrToken', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await checkOutGuest(db, eventId, 'no-such-token', OWNER_UID, 'owner@test.com', 'temporary')

    expect(result.status).toBe('not_found')
  })
})
