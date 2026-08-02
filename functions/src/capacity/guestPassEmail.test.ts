import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { sendGuestPassEmail } from './guestPassEmail.js'

describe('sendGuestPassEmail', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('logs the attempt and fails cleanly without Brevo credentials configured', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const guestId = uniqueId('guest')

    await expect(
      sendGuestPassEmail(db, { eventId, guestId, toEmail: 'ana@test.com', eventName: 'Evento de prueba', qrToken: 'tok' }),
    ).resolves.toBeUndefined()

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`pass_${guestId}`).get()
    expect(logSnap.exists).toBe(true)
    expect(logSnap.data()?.status).toBe('failed')
    expect(logSnap.data()?.toEmail).toBe('ana@test.com')
  })

  it('never sends twice for the same guest (dedup vía sendLog.create())', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId)
    const guestId = uniqueId('guest')
    const input = { eventId, guestId, toEmail: 'ana@test.com', eventName: 'Evento de prueba', qrToken: 'tok' }

    await sendGuestPassEmail(db, input)
    await expect(sendGuestPassEmail(db, input)).resolves.toBeUndefined()

    const logSnap = await db.collection('events').doc(eventId).collection('sendLog').doc(`pass_${guestId}`).get()
    expect(logSnap.data()?.status).toBe('failed')
  })
})
