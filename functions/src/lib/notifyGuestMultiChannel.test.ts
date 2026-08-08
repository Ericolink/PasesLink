import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { WHATSAPP_DAILY_BUDGET_CAP, todayDateKey } from './dailyBudget.js'
import { sendGuestNotification } from './notifyGuestMultiChannel.js'

const ORIGINAL_ENV = { ...process.env }

async function getLog(db: Firestore, eventId: string, logId: string) {
  const snap = await db.collection('events').doc(eventId).collection('sendLog').doc(logId).get()
  return snap.data()
}

describe('sendGuestNotification', () => {
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

  it('skips WhatsApp entirely without consent, even with a phone on file — falls to email', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana', phone: '+525512345678', whatsappConsent: false, email: 'ana@test.com' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: todayDateKey(),
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    const log = await getLog(db, eventId, 'log-1')
    expect(log?.channel).toBe('email')
  })

  it('skips WhatsApp when there is consent but Meta is not configured — falls to email', async () => {
    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    const outcome = await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana', phone: '+525512345678', whatsappConsent: true, email: 'ana@test.com' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: todayDateKey(),
    })

    // Sin BREVO_API_KEY en el entorno de test, el respaldo de email falla
    // limpio — lo que importa acá es que WhatsApp ni se intentó.
    expect(outcome).toBe('failed')
    const log = await getLog(db, eventId, 'log-1')
    expect(log?.channel).toBe('email')
  })

  it('sends via WhatsApp when configured and consented, without touching email', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.xyz' }] }) }),
    )

    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    const outcome = await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana', phone: '+525512345678', whatsappConsent: true, email: 'ana@test.com' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: todayDateKey(),
    })

    expect(outcome).toBe('sent')
    const log = await getLog(db, eventId, 'log-1')
    expect(log?.channel).toBe('whatsapp')
    expect(log?.providerMessageId).toBe('wamid.xyz')
    // Nunca se guarda el teléfono completo (§18 del issue) — solo la
    // versión redactada.
    expect(log?.toPhoneRedacted).toBe('***5678')
    expect(JSON.stringify(log)).not.toContain('525512345678')
  })

  it('falls back to email when the WhatsApp send itself fails', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: { code: 132001 } }) }),
    )

    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    const outcome = await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana', phone: '+525512345678', whatsappConsent: true, email: 'ana@test.com' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: todayDateKey(),
    })

    // Falla también el email (sin BREVO_API_KEY en test) — lo relevante es
    // que SÍ se intentó el respaldo, no se dio por vencido en WhatsApp.
    expect(outcome).toBe('failed')
    const log = await getLog(db, eventId, 'log-1')
    expect(log?.whatsappErrorCode).toBe('template_not_found')
    expect(log?.channel).toBe('email')
  })

  it('reports skipped_no_channel when there is no phone and no email at all', async () => {
    const eventId = uniqueId('event')
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    const outcome = await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: todayDateKey(),
    })

    expect(outcome).toBe('skipped_no_channel')
  })

  it('falls back to email once the WhatsApp daily budget is exhausted', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const eventId = uniqueId('event')
    const budgetKey = todayDateKey()
    await db.collection('sendBudget').doc(`${budgetKey}_whatsapp`).set({ count: WHATSAPP_DAILY_BUDGET_CAP })
    const logRef = db.collection('events').doc(eventId).collection('sendLog').doc('log-1')
    await logRef.create({ status: 'processing' })

    await sendGuestNotification({
      db,
      logRef,
      contact: { name: 'Ana', phone: '+525512345678', whatsappConsent: true, email: 'ana@test.com' },
      whatsapp: { templateKind: 'waitlist_offer', vars: { guestName: 'Ana', eventName: 'Fiesta', deadline: 'mañana', link: 'https://x' } },
      email: { subject: 'asunto', html: '<p>hola</p>' },
      budgetDateKey: budgetKey,
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    const log = await getLog(db, eventId, 'log-1')
    expect(log?.whatsappErrorCode).toBe('budget_exhausted')
    expect(log?.channel).toBe('email')
  })
})
