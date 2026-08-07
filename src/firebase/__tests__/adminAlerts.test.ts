import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, type EmulatorFirestore } from './helpers'

// Mismo mock que admin.test.ts: redirige el `db` singleton de adminAlerts.ts
// al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { subscribeToRecentSendFailures, type SendFailureEntry } from '../adminAlerts'

const ADMIN_UID = 'admin-1'
const EVENT_ID = 'event-1'
const USER_UID = 'user-1'

function waitForEntries(): Promise<SendFailureEntry[]> {
  return new Promise((resolve, reject) => {
    const unsub = subscribeToRecentSendFailures((entries) => {
      unsub()
      resolve(entries)
    }, reject)
  })
}

// Bug real de producción: un email de bienvenida fallido
// (users/{uid}/sendLog/welcome, ver functions/src/triggers/onUserCreated.ts)
// se mostraba en el Centro de Control con un link "Ver evento" que apuntaba
// a un evento inexistente — el uid del usuario se interpretaba como eventId
// porque sendLog no es EXCLUSIVAMENTE una subcolección de events/.
describe('adminAlerts.ts — subscribeToRecentSendFailures', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('tags an event-scoped send failure with source "event" and a real eventId', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'sendLog', 'reminder-1'), {
        toEmail: 'invitado@test.com',
        status: 'failed',
        sentAt: Date.now(),
      })
    })
    dbHolder.db = testEnv.authenticatedContext(ADMIN_UID, { admin: true }).firestore()

    const entries = await waitForEntries()

    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('event')
    expect(entries[0].eventId).toBe(EVENT_ID)
  })

  it('tags a welcome-email failure with source "welcome_email" and no eventId', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', USER_UID, 'sendLog', 'welcome'), {
        toEmail: 'nuevo@test.com',
        status: 'failed',
        sentAt: Date.now(),
      })
    })
    dbHolder.db = testEnv.authenticatedContext(ADMIN_UID, { admin: true }).firestore()

    const entries = await waitForEntries()

    expect(entries).toHaveLength(1)
    expect(entries[0].source).toBe('welcome_email')
    expect(entries[0].eventId).toBeUndefined()
  })
})
