// Modo "cupo de pagados" (ver limitCountsPaid en lib/attendeeLimit.ts):
// evento con pago + límite activado — el registro nunca se bloquea y el
// cupo solo frena las confirmaciones de pago.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { createGuestsWithCapacity } from '../capacity/createGuests.js'
import { confirmPaymentAndCheckIn } from '../checkin/confirmPaymentAndCheckIn.js'
import { remainingCapacity, remainingPaidCapacity } from '../lib/attendeeLimit.js'
import { promoteEntryToGuest } from '../waitlist/promoteToGuest.js'
import { bulkConfirmGuestPayments, confirmGuestPayment } from './confirmPayment.js'

const MANUAL = { kind: 'manual' as const, uid: 'owner-uid' }

describe('limitCountsPaid helpers', () => {
  it('leaves registration unlimited and measures the limit against paidCount when the event requires payment', () => {
    const event = { attendeeLimitEnabled: true, requiresPayment: true, capacity: 10, peopleCount: 50, paidCount: 7 }
    expect(remainingCapacity(event)).toBeNull()
    expect(remainingPaidCapacity(event)).toBe(3)
  })

  it('keeps the people-based limit for free events', () => {
    const event = { attendeeLimitEnabled: true, requiresPayment: false, capacity: 10, peopleCount: 4, paidCount: 0 }
    expect(remainingCapacity(event)).toBe(6)
    expect(remainingPaidCapacity(event)).toBeNull()
  })
})

describe('paid capacity limit', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('keeps accepting registrations past capacity (unpaid guests do not take a spot)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 2, peopleCount: 2, guestCount: 2, paidCount: 0 })

    const result = await createGuestsWithCapacity(db, eventId, [{ name: 'Ana', companions: [] }, { name: 'Beto', companions: [{}] }], 'strict')

    expect(result.createdIds).toHaveLength(2)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(5)
  })

  it('confirms a payment that fits and rejects one that would exceed the paid capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 3, paidCount: 1 })
    await seedGuest(db, eventId, 'pareja', { paymentStatus: 'unpaid', companions: [{}] })
    await seedGuest(db, eventId, 'solo', { paymentStatus: 'pending_confirmation', companions: [] })

    const fits = await confirmGuestPayment(db, eventId, 'pareja', 'paid', { method: 'cash', source: MANUAL })
    const full = await confirmGuestPayment(db, eventId, 'solo', 'paid', { method: 'transfer', source: MANUAL })

    expect(fits).toMatchObject({ ok: true, changed: true })
    expect(full).toEqual({ ok: false, reason: 'capacity_full' })
    expect((await getGuestDoc(db, eventId, 'solo'))?.paymentStatus).toBe('pending_confirmation')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(3)
  })

  it('always allows reverting a payment, even when the paid capacity is full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 1, paidCount: 1 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'paid', paymentMethod: 'cash', companions: [] })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'unpaid', { source: MANUAL })

    expect(result).toMatchObject({ ok: true, changed: true })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(0)
  })

  it('bulk-confirms in order until the paid capacity is full and reports the rest as capacity_full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 2, paidCount: 0 })
    await seedGuest(db, eventId, 'g1', { paymentStatus: 'unpaid', companions: [] })
    await seedGuest(db, eventId, 'g2', { paymentStatus: 'unpaid', companions: [] })
    await seedGuest(db, eventId, 'g3', { paymentStatus: 'unpaid', companions: [] })

    const result = await bulkConfirmGuestPayments(db, eventId, ['g1', 'g2', 'g3'], 'paid', { defaultMethod: 'cash', source: MANUAL })

    expect(result.ok).toBe(2)
    expect(result.failures).toEqual([{ guestId: 'g3', reason: 'capacity_full' }])
    expect((await getGuestDoc(db, eventId, 'g3'))?.paymentStatus).toBe('unpaid')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })

  it('blocks the scanner from confirming payment + check-in when the paid capacity is full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 1, paidCount: 1, checkedInCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { qrToken: 'qr-1', paymentStatus: 'unpaid', companions: [] })

    const result = await confirmPaymentAndCheckIn(db, eventId, 'guest-1', {
      method: 'cash', scannedBy: 'owner-uid', scannedByEmail: null, source: MANUAL,
    })

    expect(result).toEqual({ ok: false, reason: 'capacity_full' })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.status).not.toBe('checked_in')
  })

  it('promotes a waitlist entry as unpaid past capacity, but refuses "mark as paid" when the paid capacity is full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 1, peopleCount: 5, guestCount: 5, paidCount: 1 })
    await seedWaitlistEntry(db, eventId, 'w1', { partySize: 1 })
    await seedWaitlistEntry(db, eventId, 'w2', { partySize: 1 })

    const unpaid = await promoteEntryToGuest(db, eventId, 'w1', { guestUid: null })
    const paid = await promoteEntryToGuest(db, eventId, 'w2', { guestUid: null, markPaid: true, paidByUid: 'owner-uid' })

    expect(unpaid.ok).toBe(true)
    expect(paid).toEqual({ ok: false, reason: 'no_capacity' })
  })

  it('increments paidCount when a waitlist entry is promoted as paid', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { requiresPayment: true, capacity: 5, peopleCount: 0, guestCount: 0, paidCount: 0 })
    await seedWaitlistEntry(db, eventId, 'w1', { partySize: 2 })

    const result = await promoteEntryToGuest(db, eventId, 'w1', { guestUid: null, markPaid: true, paidByUid: 'owner-uid', paymentMethod: 'cash' })

    expect(result.ok).toBe(true)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })
})
