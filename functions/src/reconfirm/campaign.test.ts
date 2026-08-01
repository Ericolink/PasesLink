import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { startCampaign } from './campaign.js'

async function seedGuestFn(db: Firestore, eventId: string, guestId: string, overrides: Record<string, unknown> = {}) {
  await db.collection('events').doc(eventId).collection('guests').doc(guestId).set({
    name: 'Invitado de prueba',
    rsvpStatus: 'yes',
    paymentStatus: 'unpaid',
    ...overrides,
  })
}

describe('startCampaign', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('targets confirmed guests and skips pending/declined', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'yes-1', { rsvpStatus: 'yes' })
    await seedGuestFn(db, eventId, 'pending-1', { rsvpStatus: 'pending' })
    await seedGuestFn(db, eventId, 'no-1', { rsvpStatus: 'no' })

    const result = await startCampaign(db, { eventId, deadline: 123, excludeTagIds: [], reminderRules: [] })

    expect(result.targeted).toBe(1)
    const yesGuest = await db.collection('events').doc(eventId).collection('guests').doc('yes-1').get()
    expect(yesGuest.data()?.reconfirmStatus).toBe('requested')
    expect(yesGuest.data()?.reconfirmDeadline).toBe(123)
    const pendingGuest = await db.collection('events').doc(eventId).collection('guests').doc('pending-1').get()
    expect(pendingGuest.data()?.reconfirmStatus).toBeUndefined()
  })

  it('excludes paid guests by default', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'paid-1', { paymentStatus: 'paid' })
    await seedGuestFn(db, eventId, 'unpaid-1', { paymentStatus: 'unpaid' })

    const result = await startCampaign(db, { eventId, deadline: 123, excludeTagIds: [], reminderRules: [] })

    expect(result.targeted).toBe(1)
    const paidGuest = await db.collection('events').doc(eventId).collection('guests').doc('paid-1').get()
    expect(paidGuest.data()?.reconfirmStatus).toBeUndefined()
  })

  it('never includes paid guests — no hay opción para lo contrario, ver el diseño simplificado', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'paid-1', { paymentStatus: 'paid' })

    const result = await startCampaign(db, { eventId, deadline: 123, excludeTagIds: [], reminderRules: [] })

    expect(result.targeted).toBe(0)
    const paidGuest = await db.collection('events').doc(eventId).collection('guests').doc('paid-1').get()
    expect(paidGuest.data()?.reconfirmStatus).toBeUndefined()
  })

  it('excludes guests carrying an excluded tag (e.g. VIP)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'vip-1', { tags: ['vip-tag'] })
    await seedGuestFn(db, eventId, 'regular-1', { tags: [] })

    const result = await startCampaign(db, { eventId, deadline: 123, excludeTagIds: ['vip-tag'], reminderRules: [] })

    expect(result.targeted).toBe(1)
    const vipGuest = await db.collection('events').doc(eventId).collection('guests').doc('vip-1').get()
    expect(vipGuest.data()?.reconfirmStatus).toBeUndefined()
  })

  it('writes reconfirmCampaign on the event doc', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)

    await startCampaign(db, {
      eventId, deadline: 999, excludeTagIds: ['a'],
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }],
    })

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.reconfirmCampaign).toEqual({
      startedAt: expect.any(Number),
      deadline: 999,
      excludeTagIds: ['a'],
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }],
    })
  })
})
