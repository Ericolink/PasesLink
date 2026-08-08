import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { todayDateKey } from '../lib/dailyBudget.js'
import { sendOfferEmail } from './notify.js'

const ORIGINAL_ENV = { ...process.env }

describe('sendOfferEmail', () => {
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

  it('does nothing when the entry has no email — no log, no budget consumed', async () => {
    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento sin email' })

    await sendOfferEmail(db, eventId, 'entry-1', { name: 'Sin Email' })

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc('waitlist_offer_entry-1').get()
    expect(logSnap.exists).toBe(false)
  })

  it('logs the attempt and does not throw even without Brevo credentials configured', async () => {
    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento de prueba' })

    await expect(
      sendOfferEmail(db, eventId, 'entry-1', { name: 'Ana', email: 'ana@test.com', waitlistToken: 'tok' }),
    ).resolves.toBeUndefined()

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc('waitlist_offer_entry-1').get()
    expect(logSnap.exists).toBe(true)
    // Sin BREVO_API_KEY en el entorno de test, sendEmail falla limpio — lo
    // importante es que la promoción/cascada que ya ocurrió no se ve
    // afectada por esto (ver el comentario en notify.ts).
    expect(logSnap.data()?.status).toBe('failed')
  })

  it('never sends twice for the same entry (dedup vía sendLog.create())', async () => {
    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento de prueba' })

    await sendOfferEmail(db, eventId, 'entry-1', { name: 'Ana', email: 'ana@test.com' })
    await sendOfferEmail(db, eventId, 'entry-1', { name: 'Ana', email: 'ana@test.com' })

    const budgetSnap = await db.collection('sendBudget').doc(todayDateKey()).get()
    // Un solo intento consumió el presupuesto — el segundo llamado ni
    // siquiera llegó a pedir un slot (se cortó en el .create() del log).
    expect(budgetSnap.data()?.count).toBe(1)
  })

  it('skips sending when the daily budget is already exhausted', async () => {
    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento de prueba' })
    await db.collection('sendBudget').doc(todayDateKey()).set({ count: 300 })

    await sendOfferEmail(db, eventId, 'entry-1', { name: 'Ana', email: 'ana@test.com' })

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc('waitlist_offer_entry-1').get()
    expect(logSnap.data()?.status).toBe('skipped_budget')
  })

  it('uses WhatsApp as the primary channel when the entry has phone + consent and Meta is configured', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ messages: [{ id: 'wamid.offer' }] }) })
    vi.stubGlobal('fetch', fetchSpy)

    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento de prueba' })

    await sendOfferEmail(db, eventId, 'entry-1', {
      name: 'Ana',
      email: 'ana@test.com',
      phone: '+525512345678',
      whatsappConsent: true,
      waitlistToken: 'tok',
    })

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc('waitlist_offer_entry-1').get()
    expect(logSnap.data()?.status).toBe('sent')
    expect(logSnap.data()?.channel).toBe('whatsapp')
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('never attempts WhatsApp for an entry without consent, even with a phone on file', async () => {
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const eventId = uniqueId('event')
    await db.collection('events').doc(eventId).set({ name: 'Evento de prueba' })

    await sendOfferEmail(db, eventId, 'entry-1', {
      name: 'Ana',
      email: 'ana@test.com',
      phone: '+525512345678',
      // Sin whatsappConsent: true (ej. entrada creada por el organizador,
      // no autoservicio) — nunca debe llamar a la API de Meta.
      waitlistToken: 'tok',
    })

    expect(fetchSpy).not.toHaveBeenCalled()
    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc('waitlist_offer_entry-1').get()
    expect(logSnap.data()?.channel).toBe('email')
  })
})
