import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { expireDueReconfirmations, sendDueReminders } from './sweep.js'

const ONE_DAY_MS = 86_400_000
const ORIGINAL_ENV = { ...process.env }

async function seedGuestFn(db: Firestore, eventId: string, guestId: string, overrides: Record<string, unknown> = {}) {
  await db.collection('events').doc(eventId).collection('guests').doc(guestId).set({
    name: 'Invitado de prueba',
    qrToken: guestId,
    rsvpStatus: 'yes',
    ...overrides,
  })
}

async function seedContact(db: Firestore, eventId: string, guestId: string, email: string) {
  await db.collection('events').doc(eventId).collection('guestContacts').doc(guestId).set({ email })
}

describe('sendDueReminders', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
    delete process.env.WHATSAPP_ACCESS_TOKEN
    delete process.env.WHATSAPP_PHONE_NUMBER_ID
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
    process.env = { ...ORIGINAL_ENV }
    vi.unstubAllGlobals()
  })

  it('sends a reminder when a rule matches exactly the days left', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    const deadline = now + 2 * ONE_DAY_MS
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline, reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }] },
    })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueReminders(db, now)

    expect(result.sent + result.failed).toBe(1)
    const log = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`reconfirm_reminder_r1_guest-1_${new Date(now).toISOString().slice(0, 10)}`).get()
    expect(log.exists).toBe(true)
  })

  it('does not send when no rule matches today', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline: now + 5 * ONE_DAY_MS, reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }] },
    })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('skips a guest with no known email', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline: now + ONE_DAY_MS, reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }] },
    })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })

    const result = await sendDueReminders(db, now)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
  })

  it('never sends the same reminder twice the same day (dedup)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline: now + ONE_DAY_MS, reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }] },
    })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    await sendDueReminders(db, now)
    const second = await sendDueReminders(db, now)

    expect(second.sent + second.failed + second.skipped).toBe(0)
  })

  it('ignores events without an active campaign', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueReminders(db, Date.now())

    expect(result.sent).toBe(0)
  })

  it('only targets guests with reconfirmStatus requested (not confirmed/expired)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline: now + ONE_DAY_MS, reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }] },
    })
    await seedGuestFn(db, eventId, 'confirmed-1', { reconfirmStatus: 'confirmed' })
    await seedContact(db, eventId, 'confirmed-1', 'confirmed@test.com')

    const result = await sendDueReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('uses WhatsApp when the guest contact has phone + consent and Meta is configured', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.reconfirm' }] }) })
    vi.stubGlobal('fetch', fetchSpy)

    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      reconfirmCampaign: { deadline: now + ONE_DAY_MS, reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }] },
    })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested' })
    await db.collection('events').doc(eventId).collection('guestContacts').doc('guest-1').set({
      email: 'guest1@test.com',
      phone: '+525512345678',
      whatsappConsent: true,
    })

    const result = await sendDueReminders(db, now)

    expect(result.sent).toBe(1)
    const log = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`reconfirm_reminder_r1_guest-1_${new Date(now).toISOString().slice(0, 10)}`).get()
    expect(log.data()?.channel).toBe('whatsapp')
  })
})

describe('expireDueReconfirmations', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('marks a guest expired once the deadline has passed without a response', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested', reconfirmDeadline: now - 1000 })

    const result = await expireDueReconfirmations(db, now)

    expect(result.expiredCount).toBe(1)
    const guest = await db.collection('events').doc(eventId).collection('guests').doc('guest-1').get()
    expect(guest.data()?.reconfirmStatus).toBe('expired')
  })

  it('leaves a guest whose deadline has not arrived yet untouched', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested', reconfirmDeadline: now + ONE_DAY_MS })

    const result = await expireDueReconfirmations(db, now)

    expect(result.expiredCount).toBe(0)
    const guest = await db.collection('events').doc(eventId).collection('guests').doc('guest-1').get()
    expect(guest.data()?.reconfirmStatus).toBe('requested')
  })

  it('does not touch a guest who already confirmed', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId)
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'confirmed', reconfirmDeadline: now - 1000 })

    const result = await expireDueReconfirmations(db, now)

    expect(result.expiredCount).toBe(0)
  })

  it('never releases the spot — peopleCount stays untouched', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { peopleCount: 5 })
    await seedGuestFn(db, eventId, 'guest-1', { reconfirmStatus: 'requested', reconfirmDeadline: now - 1000 })

    await expireDueReconfirmations(db, now)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(5)
  })
})
