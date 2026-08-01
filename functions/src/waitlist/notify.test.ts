import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { todayDateKey } from '../lib/dailyBudget.js'
import { sendOfferEmail } from './notify.js'

describe('sendOfferEmail', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
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
})
