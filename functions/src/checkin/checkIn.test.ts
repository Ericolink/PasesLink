import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { checkInGuest } from './checkIn.js'
import { checkOutGuest } from './checkOut.js'

const OWNER_UID = 'owner-uid'
const QR_TOKEN = 'qr-token-1'

describe('checkInGuest (servicio)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('checks in a guest and increments checkedInCount/occupancyCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    const result = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(1)
    expect(event.data()?.occupancyCount).toBe(1)
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.status).toBe('checked_in')
    expect(guest?.checkedInBy).toBe(OWNER_UID)
    expect(guest?.checkedInByEmail).toBe('owner@test.com')
  })

  it('increments checkinsByHour for the current hour bucket on check-in', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')

    const expectedHourLabel = `${new Date().getHours().toString().padStart(2, '0')}:00`
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkinsByHour).toEqual({ [expectedHourLabel]: 1 })
  })

  it('sums companions into checkedInCount on check-in', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', {
      qrToken: QR_TOKEN,
      companions: [{ name: 'Uno' }, { name: 'Dos' }, { name: 'Tres' }],
    })

    const result = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(4)
  })

  it('rejects a duplicate check-in for the same guest, without double-counting', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    const first = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(first.status).toBe('success')

    const second = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(second.status).toBe('already_checked_in')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(1)
  })

  it('allows re-entry after a temporary exit without double-counting checkedInCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const checkout = await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    expect(checkout.status).toBe('success')

    const reentry = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('success')
    if (reentry.status === 'success') expect(reentry.reentry).toBe(true)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(1)
    expect(event.data()?.occupancyCount).toBe(1)
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.checkedOutAt).toBe(null)
  })

  it('tracks live occupancy across check-in, temporary exit and re-entry, including companions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0, occupancyCount: 0 })
    await seedGuest(db, eventId, 'guest-1', {
      qrToken: QR_TOKEN,
      companions: [{ name: 'Uno' }, { name: 'Dos' }],
    })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    let event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(3)
    expect(event.data()?.occupancyCount).toBe(3)

    await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(3)
    expect(event.data()?.occupancyCount).toBe(0)

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.checkedInCount).toBe(3)
    expect(event.data()?.occupancyCount).toBe(3)
  })

  it('blocks re-entry after a final exit and records the rejection in checkins', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    const checkout = await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'final')
    expect(checkout.status).toBe('success')

    const reentry = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('blocked_final_exit')

    const checkinsSnap = await db.collection('events').doc(eventId).collection('checkins').where('type', '==', 'entry_blocked').get()
    expect(checkinsSnap.size).toBe(1)
    expect(checkinsSnap.docs[0].data().reason).toBe('final_exit_blocked')
    expect(checkinsSnap.docs[0].data().guestId).toBe('guest-1')
  })

  it('allows re-entry even if payment status changed to unpaid while the guest was out', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0, requiresPayment: true })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'paid' })

    await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    await checkOutGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com', 'temporary')
    await db.collection('events').doc(eventId).collection('guests').doc('guest-1').update({ paymentStatus: 'unpaid' })

    const reentry = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')
    expect(reentry.status).toBe('success')
  })

  it('blocks the first entry of an unpaid guest in a paid event', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true })
    await seedGuest(db, eventId, 'guest-1', { qrToken: QR_TOKEN, paymentStatus: 'unpaid' })

    const result = await checkInGuest(db, eventId, QR_TOKEN, OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('payment_required')
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.status).toBe('invited')
  })

  it('returns not_found for an unknown qrToken', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    const result = await checkInGuest(db, eventId, 'no-such-token', OWNER_UID, 'owner@test.com')

    expect(result.status).toBe('not_found')
  })
})
