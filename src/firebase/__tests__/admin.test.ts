import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, seedUserProfile, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/wall.test.ts: redirige el `db` singleton de
// admin.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { getAllEvents, getAllUsers } from '../admin'

const OWNER_UID = 'owner-uid'
const ADMIN_UID = 'admin-uid'
const OTHER_UID = 'someone-else-uid'

async function seedAdmin(testEnv: RulesTestEnvironment, uid: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'admins', uid), { addedAt: Date.now() })
  })
}

// Auditoría de escalabilidad (F10): getAllEvents/getAllUsers reemplazan los
// listeners en vivo (subscribeToAllEvents/subscribeToAllUsers) por lecturas
// puntuales — mismas reglas de acceso que antes, ver firestore.rules
// (events: allow read: if true; users: allow list solo para admin o
// query con limit<=1).
describe('admin.ts — getAllEvents/getAllUsers (auditoría F10)', () => {
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

  it('getAllEvents returns every event ordered by createdAt desc, even unauthenticated', async () => {
    await seedEvent(testEnv, 'event-old', { ownerId: OWNER_UID, name: 'Viejo', createdAt: 100 })
    await seedEvent(testEnv, 'event-new', { ownerId: OWNER_UID, name: 'Nuevo', createdAt: 200 })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    const events = await getAllEvents()

    expect(events.map((e) => e.name)).toEqual(['Nuevo', 'Viejo'])
  })

  it('getAllUsers lets an admin list every user', async () => {
    await seedAdmin(testEnv, ADMIN_UID)
    await seedUserProfile(testEnv, 'user-a', { displayName: 'A', createdAt: 100 })
    await seedUserProfile(testEnv, 'user-b', { displayName: 'B', createdAt: 200 })
    dbHolder.db = testEnv.authenticatedContext(ADMIN_UID).firestore()

    const users = await getAllUsers()

    expect(users.map((u) => u.displayName).sort()).toEqual(['A', 'B'])
  })

  it('getAllUsers rejects a non-admin authenticated user', async () => {
    await seedUserProfile(testEnv, 'user-a')
    dbHolder.db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await expect(getAllUsers()).rejects.toThrow()
  })

  it('getAllUsers rejects an unauthenticated request', async () => {
    await seedUserProfile(testEnv, 'user-a')
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(getAllUsers()).rejects.toThrow()
  })
})
