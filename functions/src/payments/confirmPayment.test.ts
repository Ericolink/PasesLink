import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestDoc, getTestFirestore, seedEvent, seedGuest, uniqueId } from '../__tests__/helpers.js'
import { bulkConfirmGuestPayments, confirmGuestPayment } from './confirmPayment.js'

const MANUAL = { kind: 'manual' as const, uid: 'owner-uid' }

describe('confirmGuestPayment', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks the guest as paid, sets paidAt/paidBy, and increments paidCount by partySize', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', companions: [{}, {}] })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'paid', { method: 'cash', source: MANUAL })

    expect(result).toMatchObject({ ok: true, changed: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.paymentMethod).toBe('cash')
    expect(guest?.paidBy).toBe('owner-uid')
    expect(typeof guest?.paidAt).toBe('number')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(3)
  })

  it('preserves paymentMethod: null (guest never chose at RSVP, event allows 2+ methods) when confirming without an explicit method', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0, paymentMethods: ['transfer', 'cash'] })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', paymentMethod: null })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'paid', { source: MANUAL })

    expect(result).toMatchObject({ ok: true, changed: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('paid')
    expect(guest?.paymentMethod).toBeNull()
  })

  it('lets two guests of the same event coexist with different methods (Juan → transfer, María → cash)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0, paymentMethods: ['transfer', 'cash'] })
    await seedGuest(db, eventId, 'juan', { name: 'Juan', paymentStatus: 'unpaid', paymentMethod: null })
    await seedGuest(db, eventId, 'maria', { name: 'María', paymentStatus: 'unpaid', paymentMethod: null })

    await confirmGuestPayment(db, eventId, 'juan', 'paid', { method: 'transfer', source: MANUAL })
    await confirmGuestPayment(db, eventId, 'maria', 'paid', { method: 'cash', source: MANUAL })

    const juan = await getGuestDoc(db, eventId, 'juan')
    const maria = await getGuestDoc(db, eventId, 'maria')
    expect(juan?.paymentMethod).toBe('transfer')
    expect(maria?.paymentMethod).toBe('cash')
  })

  it('reverts a payment, decrements paidCount, and clears paidAt/paidBy', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 3 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'paid', paymentMethod: 'transfer', paidAt: 1000, paidBy: 'owner-uid', companions: [{}, {}] })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'unpaid', { source: MANUAL })

    expect(result).toMatchObject({ ok: true, changed: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentStatus).toBe('unpaid')
    expect(guest?.paidAt).toBeNull()
    expect(guest?.paidBy).toBeNull()
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(0)
  })

  it('does not double-count paidCount when approving a payment that was already paid (only the method changes)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 3 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'paid', paymentMethod: 'transfer', paidAt: 1000, paidBy: 'owner-uid', companions: [{}, {}] })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'paid', { method: 'cash', source: MANUAL })

    expect(result).toMatchObject({ ok: true, changed: true })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentMethod).toBe('cash')
    // El paidAt original de la primera confirmación no se pisa por corregir el método.
    expect(guest?.paidAt).toBe(1000)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(3)
  })

  it('is idempotent: repeating the exact same call does nothing (no writes, changed: false)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 2 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'paid', paymentMethod: 'cash', paidAt: 1000, paidBy: 'owner-uid', companions: [{}] })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'paid', { method: 'cash', source: MANUAL })

    expect(result).toEqual({ ok: true, changed: false, notify: null })
    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paidAt).toBe(1000)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })

  it('rejects a nonexistent event', async () => {
    const result = await confirmGuestPayment(db, uniqueId('event'), 'guest-1', 'paid', { source: MANUAL })
    expect(result).toEqual({ ok: false, reason: 'event_not_found' })
  })

  it('rejects a nonexistent guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const result = await confirmGuestPayment(db, eventId, 'ghost-guest', 'paid', { source: MANUAL })
    expect(result).toEqual({ ok: false, reason: 'guest_not_found' })
  })

  it('rejects a guest that belongs to a different event', async () => {
    const eventA = uniqueId('event')
    const eventB = uniqueId('event')
    await seedEvent(db, eventA)
    await seedEvent(db, eventB)
    await seedGuest(db, eventA, 'guest-1', { paymentStatus: 'unpaid' })

    const result = await confirmGuestPayment(db, eventB, 'guest-1', 'paid', { source: MANUAL })

    expect(result).toEqual({ ok: false, reason: 'guest_not_found' })
    const guestUnderA = await getGuestDoc(db, eventA, 'guest-1')
    expect(guestUnderA?.paymentStatus).toBe('unpaid')
  })

  it('returns notify info only on the real unpaid -> paid transition', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: 'owner-uid', name: 'Fiesta de prueba' })
    await seedGuest(db, eventId, 'guest-1', { name: 'Ana', paymentStatus: 'unpaid' })

    const result = await confirmGuestPayment(db, eventId, 'guest-1', 'paid', { source: MANUAL })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.notify).toEqual({ ownerId: 'owner-uid', eventName: 'Fiesta de prueba', guestName: 'Ana' })
  })
})

describe('bulkConfirmGuestPayments', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks every guest as paid and applies a single aggregate paidCount delta', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', companions: [] })
    await seedGuest(db, eventId, 'guest-2', { paymentStatus: 'unpaid', companions: [{}] })

    const result = await bulkConfirmGuestPayments(db, eventId, ['guest-1', 'guest-2'], 'paid', { defaultMethod: 'cash', source: MANUAL })

    expect(result.ok).toBe(2)
    expect(result.failed).toBe(0)
    const g1 = await getGuestDoc(db, eventId, 'guest-1')
    const g2 = await getGuestDoc(db, eventId, 'guest-2')
    expect(g1?.paymentStatus).toBe('paid')
    expect(g1?.paymentMethod).toBe('cash')
    expect(g2?.paymentStatus).toBe('paid')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(3)
  })

  it('reports partial failures for guestIds that do not exist, without failing the whole batch', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid' })
    await seedGuest(db, eventId, 'guest-2', { paymentStatus: 'unpaid' })

    const result = await bulkConfirmGuestPayments(db, eventId, ['guest-1', 'ghost-1', 'guest-2', 'ghost-2'], 'paid', { defaultMethod: 'transfer', source: MANUAL })

    expect(result.ok).toBe(2)
    expect(result.failed).toBe(2)
    expect(result.failures).toEqual(expect.arrayContaining([
      { guestId: 'ghost-1', reason: 'not_found' },
      { guestId: 'ghost-2', reason: 'not_found' },
    ]))
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.paidCount).toBe(2)
  })

  it('preserves a guest’s own payment method over defaultMethod', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { paidCount: 0 })
    await seedGuest(db, eventId, 'guest-1', { paymentStatus: 'unpaid', paymentMethod: 'transfer' })

    await bulkConfirmGuestPayments(db, eventId, ['guest-1'], 'paid', { defaultMethod: 'cash', source: MANUAL })

    const guest = await getGuestDoc(db, eventId, 'guest-1')
    expect(guest?.paymentMethod).toBe('transfer')
  })
})
