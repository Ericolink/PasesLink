import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/capacity.test.ts: redirige el `db` singleton
// de photos.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { pinPhoto } from '../photos'

const OWNER_UID = 'owner-uid'
const OTHER_UID = 'someone-else-uid'
const EVENT_ID = 'event-1'
const PHOTO_ID = 'photo-1'

async function seedPhoto(testEnv: RulesTestEnvironment, overrides: Record<string, unknown> = {}) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID), {
      url: 'https://res.cloudinary.com/demo/image/upload/photo.jpg',
      authorName: 'Invitado de prueba',
      authorToken: 'guest-token',
      caption: '',
      pinned: false,
      createdAt: Date.now(),
      ...overrides,
    })
  })
}

async function getPhotoDoc(testEnv: RulesTestEnvironment) {
  let result: Record<string, unknown> | undefined
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const snap = await getDoc(doc(context.firestore(), 'events', EVENT_ID, 'photos', PHOTO_ID))
    result = snap.data()
  })
  return result
}

describe('photos.ts — pinPhoto', () => {
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

  it('lets the event owner pin a photo', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await expect(pinPhoto(EVENT_ID, PHOTO_ID, false)).resolves.toBeUndefined()

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(true)
  })

  it('lets the owner unpin a photo that was already pinned', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv, { pinned: true })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await pinPhoto(EVENT_ID, PHOTO_ID, true)

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(false)
  })

  it('rejects pinning from a user who is neither owner nor co-organizer', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedPhoto(testEnv)
    dbHolder.db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await expect(pinPhoto(EVENT_ID, PHOTO_ID, false)).rejects.toThrow()

    const photo = await getPhotoDoc(testEnv)
    expect(photo?.pinned).toBe(false)
  })
})
