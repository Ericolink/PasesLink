import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { sendDueRsvpReminders } from './reminders.js'

const ONE_DAY_MS = 86_400_000

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function deadlineISO(now: number, daysAhead: number): string {
  return new Date(new Date(todayISO(now)).getTime() + daysAhead * ONE_DAY_MS).toISOString().slice(0, 10)
}

async function seedGuestFn(db: Firestore, eventId: string, guestId: string, overrides: Record<string, unknown> = {}) {
  await db.collection('events').doc(eventId).collection('guests').doc(guestId).set({
    name: 'Invitado de prueba',
    qrToken: guestId,
    rsvpStatus: 'pending',
    ...overrides,
  })
}

async function seedContact(db: Firestore, eventId: string, guestId: string, email: string) {
  await db.collection('events').doc(eventId).collection('guestContacts').doc(guestId).set({ email })
}

describe('sendDueRsvpReminders', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('sends a reminder when a rule matches exactly the days left', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'active',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 2),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }],
    })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueRsvpReminders(db, now)

    expect(result.sent + result.failed).toBe(1)
    const todayKey = todayISO(now)
    const log = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`reminder_r1_guest-1_${todayKey}`).get()
    expect(log.exists).toBe(true)
  })

  it('does not send when no rule matches today', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'active',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 5),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }],
    })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueRsvpReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.failed).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('ignores events with remindersEnabled false or status not active', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'draft',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 2),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 2 }],
    })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueRsvpReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('ignores events without an rsvpDeadline set', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { status: 'active', remindersEnabled: true })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueRsvpReminders(db, Date.now())

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('skips a guest with no known email', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'active',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 1),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }],
    })
    await seedGuestFn(db, eventId, 'guest-1')

    const result = await sendDueRsvpReminders(db, now)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
  })

  it('only targets guests with rsvpStatus pending (not yes/no)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'active',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 1),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }],
    })
    await seedGuestFn(db, eventId, 'confirmed-1', { rsvpStatus: 'yes' })
    await seedContact(db, eventId, 'confirmed-1', 'confirmed@test.com')

    const result = await sendDueRsvpReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('never sends the same reminder twice the same day (dedup)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, {
      status: 'active',
      remindersEnabled: true,
      rsvpDeadline: deadlineISO(now, 1),
      reminderRules: [{ id: 'r1', daysBeforeDeadline: 1 }],
    })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    await sendDueRsvpReminders(db, now)
    const second = await sendDueRsvpReminders(db, now)

    expect(second.sent + second.failed + second.skipped).toBe(0)
  })
})
