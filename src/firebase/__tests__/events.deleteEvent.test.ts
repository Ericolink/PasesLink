import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, seedGuest, type EmulatorFirestore } from './helpers'

// Mismo mock que guests.test.ts/photos.test.ts: redirige el `db` singleton
// de events.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { deleteEvent } from '../events'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'

async function seedFullEvent(testEnv: RulesTestEnvironment) {
  await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
  await seedGuest(testEnv, EVENT_ID, 'guest-1')
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await setDoc(doc(db, 'events', EVENT_ID, 'guestContacts', 'guest-1'), { email: 'a@test.com', phone: '' })
    await setDoc(doc(db, 'events', EVENT_ID, 'checkins', 'checkin-1'), {
      type: 'check_in', guestId: 'guest-1', timestamp: Date.now(), scannedBy: OWNER_UID, scannedByEmail: 'owner@test.com',
    })
    await setDoc(doc(db, 'events', EVENT_ID, 'photos', 'photo-1'), {
      url: 'https://res.cloudinary.com/demo/image/upload/p.jpg', authorName: 'Invitado', authorToken: 't1',
      caption: '', pinned: false, createdAt: Date.now(),
    })
    await setDoc(doc(db, 'events', EVENT_ID, 'wall', 'msg-1'), {
      text: 'Hola', type: 'comment', authorName: 'Invitado', authorToken: 't1', authorRole: 'guest',
      authorPhotoURL: null, reactions: {}, replies: [], deleted: false, pinned: false, createdAt: Date.now(),
    })
    // Entrada huérfana de la funcionalidad de waitlist ya eliminada — nunca
    // debe impedir el borrado del resto (ver comentario en deleteEvent).
    await setDoc(doc(db, 'events', EVENT_ID, 'waitlist', 'stale-1'), { guestId: 'ghost', createdAt: Date.now() })
  })
}

async function subcollectionSizes(testEnv: RulesTestEnvironment) {
  let sizes: Record<string, number> = {}
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    const subs = ['guests', 'guestContacts', 'checkins', 'photos', 'wall']
    const snaps = await Promise.all(subs.map((s) => getDocs(collection(db, 'events', EVENT_ID, s))))
    sizes = Object.fromEntries(subs.map((s, i) => [s, snaps[i].size]))
  })
  return sizes
}

// Issue #119: deleteEvent() intentaba `getDocs()` sobre `waitlist`, colección
// bloqueada sin excepción por firestore.rules (`allow read, write: if
// false`) desde que se eliminó esa funcionalidad — cualquier borrado de
// evento rechazaba con permission-denied ANTES de borrar nada, ni siquiera
// el documento del evento. Este test prueba el fix: ya no toca `waitlist`
// (una entrada huérfana de antes no debe bloquear nada), y sí limpia
// `photos`/`wall` (antes quedaban huérfanas silenciosamente).
describe('events.ts — deleteEvent', () => {
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

  it('deletes the event and all its active subcollections without being blocked by a stale waitlist entry', async () => {
    await seedFullEvent(testEnv)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await deleteEvent(EVENT_ID)

    const sizes = await subcollectionSizes(testEnv)
    expect(sizes).toEqual({ guests: 0, guestContacts: 0, checkins: 0, photos: 0, wall: 0 })

    let eventSnap
    await testEnv.withSecurityRulesDisabled(async (context) => {
      eventSnap = await getDoc(doc(context.firestore(), 'events', EVENT_ID))
    })
    expect(eventSnap!.exists()).toBe(false)
  })
})
