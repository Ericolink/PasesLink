import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { arrayRemove, arrayUnion, doc, updateDoc } from 'firebase/firestore'
import { createTestEnv, seedUserProfile } from './helpers'

const OWNER_UID = 'owner-uid'
const OTHER_UID = 'other-uid'

// users/{uid}.fcmTokens (src/firebase/messaging.ts) reutiliza la regla
// genérica `allow write: if request.auth.uid == userId` de users/{userId} —
// sin campo nuevo en firestore.rules. Este test confirma el requisito de
// seguridad #10 del issue: un usuario no puede registrar/borrar un token
// en el documento de otro usuario.
describe('firestore.rules — users/{uid}.fcmTokens', () => {
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

  it('allows a user to add a push token to their own document', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertSucceeds(updateDoc(doc(db, 'users', OWNER_UID), { fcmTokens: arrayUnion('token-1') }))
  })

  it('allows a user to remove their own push token', async () => {
    await seedUserProfile(testEnv, OWNER_UID, { fcmTokens: ['token-1'] })
    const db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertSucceeds(updateDoc(doc(db, 'users', OWNER_UID), { fcmTokens: arrayRemove('token-1') }))
  })

  it('rejects registering a push token on another user document', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await assertFails(updateDoc(doc(db, 'users', OWNER_UID), { fcmTokens: arrayUnion('token-1') }))
  })

  it('rejects an unauthenticated write', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.unauthenticatedContext().firestore()

    await assertFails(updateDoc(doc(db, 'users', OWNER_UID), { fcmTokens: arrayUnion('token-1') }))
  })
})
