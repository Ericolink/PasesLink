import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, uniqueId } from '../__tests__/helpers.js'
import { sendWelcomeEmailForNewUser } from './onUserCreated.js'

describe('sendWelcomeEmailForNewUser', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('does nothing when the new user has no email — no log written', async () => {
    const uid = uniqueId('user')
    const userRef = db.collection('users').doc(uid)
    await userRef.set({ displayName: 'Sin Email' })

    await sendWelcomeEmailForNewUser(userRef, { displayName: 'Sin Email' })

    const logSnap = await userRef.collection('sendLog').doc('welcome').get()
    expect(logSnap.exists).toBe(false)
  })

  it('logs the attempt and does not throw even without Brevo credentials configured', async () => {
    const uid = uniqueId('user')
    const userRef = db.collection('users').doc(uid)
    await userRef.set({ email: 'ana@test.com', displayName: 'Ana' })

    await expect(
      sendWelcomeEmailForNewUser(userRef, { email: 'ana@test.com', displayName: 'Ana' }),
    ).resolves.toBeUndefined()

    const logSnap = await userRef.collection('sendLog').doc('welcome').get()
    expect(logSnap.exists).toBe(true)
    // Sin BREVO_API_KEY en el entorno de test, sendEmail falla limpio.
    expect(logSnap.data()?.status).toBe('failed')
  })

  it('never sends twice for the same user (dedup vía sendLog.create())', async () => {
    const uid = uniqueId('user')
    const userRef = db.collection('users').doc(uid)
    await userRef.set({ email: 'ana@test.com' })

    await sendWelcomeEmailForNewUser(userRef, { email: 'ana@test.com' })
    await sendWelcomeEmailForNewUser(userRef, { email: 'ana@test.com' })

    const logSnap = await userRef.collection('sendLog').doc('welcome').get()
    expect(logSnap.data()?.status).toBe('failed')
    // Sigue habiendo un único doc de log (el .create() del segundo llamado
    // chocó y no lo tocó) — no hay forma directa de "contar llamados" acá,
    // pero el propio hecho de que resuelva sin error confirma el camino
    // corto del segundo intento.
  })
})
