import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { buildReminderCopy, sendDueEventReminders } from './upcomingReminders.js'

const ONE_DAY_MS = 86_400_000

function todayISO(now: number): string {
  return new Date(now).toISOString().slice(0, 10)
}

function eventDateISO(now: number, daysAhead: number): string {
  return new Date(new Date(todayISO(now)).getTime() + daysAhead * ONE_DAY_MS).toISOString().slice(0, 10)
}

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

describe('sendDueEventReminders', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('sends a reminder 7 days before the event to a confirmed guest', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 7) })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueEventReminders(db, now)

    expect(result.sent + result.failed).toBe(1)
    const todayKey = todayISO(now)
    const log = await db.collection('events').doc(eventId).collection('sendLog')
      .doc(`eventReminder_7_guest-1_${todayKey}`).get()
    expect(log.exists).toBe(true)
  })

  it('sends a reminder 1 day before the event', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 1) })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueEventReminders(db, now)

    expect(result.sent + result.failed).toBe(1)
  })

  it('does not send when the event is not exactly 7 or 1 days away', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 3) })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueEventReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
    expect(result.failed).toBe(0)
  })

  it('ignores events that are not active', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'draft', date: eventDateISO(now, 7) })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    const result = await sendDueEventReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('only targets guests with rsvpStatus yes (not pending/no)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 1) })
    await seedGuestFn(db, eventId, 'pending-1', { rsvpStatus: 'pending' })
    await seedContact(db, eventId, 'pending-1', 'pending@test.com')

    const result = await sendDueEventReminders(db, now)

    expect(result.sent).toBe(0)
    expect(result.skipped).toBe(0)
  })

  it('skips a confirmed guest with no known email', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 1) })
    await seedGuestFn(db, eventId, 'guest-1')

    const result = await sendDueEventReminders(db, now)

    expect(result.skipped).toBe(1)
    expect(result.sent).toBe(0)
  })

  it('never sends the same reminder twice the same day (dedup)', async () => {
    const eventId = uniqueId('event')
    const now = Date.now()
    await seedEvent(db, eventId, { status: 'active', date: eventDateISO(now, 1) })
    await seedGuestFn(db, eventId, 'guest-1')
    await seedContact(db, eventId, 'guest-1', 'guest1@test.com')

    await sendDueEventReminders(db, now)
    const second = await sendDueEventReminders(db, now)

    expect(second.sent + second.failed + second.skipped).toBe(0)
  })
})

describe('buildReminderCopy', () => {
  it('includes the event cover image as hero when the event has one', () => {
    const { html } = buildReminderCopy(7, 'Fiesta de Ana', '2026-09-20', 'Salón Encanto', 'https://res.cloudinary.com/demo/ana.jpg', 'https://www.paselink.com/pass/e1/q1')

    expect(html).toContain('https://res.cloudinary.com/demo/ana.jpg')
    expect(html).toContain('alt="Fiesta de Ana"')
  })

  it('omits the hero image entirely when the event has none', () => {
    const { html } = buildReminderCopy(1, 'Fiesta de Ana', '2026-09-14', 'Salón Encanto', undefined, 'https://www.paselink.com/pass/e1/q1')

    expect(html).not.toContain('<img src=""')
    expect((html.match(/<img/g) || []).length).toBe(1) // solo el logo, sin hero
  })
})
