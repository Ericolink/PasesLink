import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { createTestEnv, seedUserProfile } from './helpers'

const OWNER_UID = 'owner-uid'
const OTHER_UID = 'other-uid'

function validAcceptance() {
  return {
    documents: [{ id: 'terms', version: '2026-07-10' }, { id: 'privacy', version: '2026-07-10' }],
    method: 'register_email',
    acceptedAt: serverTimestamp(),
  }
}

describe('firestore.rules — users/{uid}/legalAcceptances', () => {
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

  it('allows a user to create their own acceptance record', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertSucceeds(addDoc(collection(db, 'users', OWNER_UID, 'legalAcceptances'), validAcceptance()))
  })

  it('rejects creating an acceptance record for another uid', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.authenticatedContext(OTHER_UID).firestore()

    await assertFails(addDoc(collection(db, 'users', OWNER_UID, 'legalAcceptances'), validAcceptance()))
  })

  it('rejects an unauthenticated create', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.unauthenticatedContext().firestore()

    await assertFails(addDoc(collection(db, 'users', OWNER_UID, 'legalAcceptances'), validAcceptance()))
  })

  it('rejects a create without a matching acceptedAt server timestamp', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    const db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertFails(addDoc(collection(db, 'users', OWNER_UID, 'legalAcceptances'), {
      ...validAcceptance(),
      acceptedAt: Date.now(),
    }))
  })

  it('rejects update and delete even by the owner, keeping the log append-only', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OWNER_UID, 'legalAcceptances', 'entry-1'), validAcceptance())
    })
    const db = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertFails(updateDoc(doc(db, 'users', OWNER_UID, 'legalAcceptances', 'entry-1'), { method: 'google' }))
    await assertFails(deleteDoc(doc(db, 'users', OWNER_UID, 'legalAcceptances', 'entry-1')))
  })

  it('lets the owner read their own history but not another user', async () => {
    await seedUserProfile(testEnv, OWNER_UID)
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'users', OWNER_UID, 'legalAcceptances', 'entry-1'), validAcceptance())
    })

    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()
    await assertSucceeds(getDocs(collection(ownerDb, 'users', OWNER_UID, 'legalAcceptances')))

    const otherDb = testEnv.authenticatedContext(OTHER_UID).firestore()
    await assertFails(getDocs(collection(otherDb, 'users', OWNER_UID, 'legalAcceptances')))
  })
})
