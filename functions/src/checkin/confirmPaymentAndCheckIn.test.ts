import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { confirmPaymentAndCheckIn } from './confirmPaymentAndCheckIn.js'
import { checkInGuest } from './checkIn.js'
import { checkOutGuest } from './checkOut.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

function opts(method?: 'transfer' | 'cash') {
  return { method, scannedBy: OWNER_UID, scannedByEmail: 'owner@test.com', source: { kind: 'manual' as const, uid: OWNER_UID } }
}

describe('confirmPaymentAndCheckIn (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('confirms payment and checks in an unpaid guest in a single atomic call', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, checkedInCount: 0, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })

    const result = await confirmPaymentAndCheckIn(db, eventId, 'guest-1', opts('cash'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.checkIn).toBe('success')
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.status).toBe('checked_in')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(1)
    expect(event.data()?.checkedInCount).toBe(1)
    expect(event.data()?.occupancyCount).toBe(1)
  })

  it('is idempotent: calling it twice for the same guest does not double-count paidCount/checkedInCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, checkedInCount: 0, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })

    await confirmPaymentAndCheckIn(db, eventId, 'guest-1', opts('cash'))
    const second = await confirmPaymentAndCheckIn(db, eventId, 'guest-1', opts('cash'))

    expect(second.ok).toBe(true)
    if (second.ok) expect(second.checkIn).toBe('already_checked_in')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(1)
    expect(event.data()?.checkedInCount).toBe(1)
  })

  it('still confirms the payment when the guest is already checked in, without double-counting the check-in', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: false, checkedInCount: 0, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })
    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')

    const result = await confirmPaymentAndCheckIn(db, eventId, 'guest-1', opts('cash'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.checkIn).toBe('already_checked_in')
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(1)
    expect(event.data()?.checkedInCount).toBe(1)
  })

  it('confirms the payment but blocks entry for a guest that exited definitively', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: false, checkedInCount: 0, paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })
    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'final')

    const result = await confirmPaymentAndCheckIn(db, eventId, 'guest-1', opts('cash'))

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.checkIn).toBe('blocked_final_exit')
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    const checkinsSnap = await db.collection('events').doc(eventId).collection('checkins').where('type', '==', 'entry_blocked').get()
    expect(checkinsSnap.size).toBe(1)
  })

  it('rejects a nonexistent event', async () => {
    const result = await confirmPaymentAndCheckIn(db, uniqueId('event'), 'guest-1', opts('cash'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('event_not_found')
  })

  it('rejects a nonexistent guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await confirmPaymentAndCheckIn(db, eventId, 'ghost', opts('cash'))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('guest_not_found')
  })
})
