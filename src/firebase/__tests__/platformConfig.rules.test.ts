import { afterAll, afterEach, beforeAll, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { createTestEnv } from './helpers'

// Cubre platformConfig/maintenance (ver firestore.rules y
// src/hooks/useMaintenanceMode.ts): lectura pública (incluso sin sesión,
// porque MaintenanceGate necesita saberlo antes de resolver si hay usuario),
// escritura solo para admins, y la validación de forma que evita que un
// admin (o un cliente que hable directo contra Firestore) guarde un campo
// fuera de lo esperado.
describe('platformConfig/maintenance', () => {
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

  it('allows anyone, even without a session, to read the doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'platformConfig', 'maintenance'), {
        enabled: true,
        message: '',
        updatedAt: Date.now(),
        updatedBy: 'admin-1',
      })
    })
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertSucceeds(getDoc(doc(anonDb, 'platformConfig', 'maintenance')))
  })

  it('allows a signed-in non-admin to read the doc', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), 'platformConfig', 'maintenance'), {
        enabled: false,
        message: '',
        updatedAt: Date.now(),
        updatedBy: 'admin-1',
      })
    })
    const userDb = testEnv.authenticatedContext('user-1').firestore()

    await assertSucceeds(getDoc(doc(userDb, 'platformConfig', 'maintenance')))
  })

  it('allows an admin to enable maintenance mode', async () => {
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    await assertSucceeds(
      setDoc(doc(adminDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: 'Volvemos en un rato',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin-1',
      }),
    )
  })

  it('rejects a non-admin trying to enable maintenance mode', async () => {
    const userDb = testEnv.authenticatedContext('user-1').firestore()

    await assertFails(
      setDoc(doc(userDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: '',
        updatedAt: serverTimestamp(),
        updatedBy: 'user-1',
      }),
    )
  })

  it('rejects an unauthenticated client trying to write', async () => {
    const anonDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(
      setDoc(doc(anonDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: '',
        updatedAt: serverTimestamp(),
        updatedBy: 'anon',
      }),
    )
  })

  it('rejects an admin write that claims a different updatedBy uid', async () => {
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    await assertFails(
      setDoc(doc(adminDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: '',
        updatedAt: serverTimestamp(),
        updatedBy: 'someone-else',
      }),
    )
  })

  it('rejects a write with an extra field outside the closed schema', async () => {
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    await assertFails(
      setDoc(doc(adminDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: '',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin-1',
        etaMinutes: 10,
      }),
    )
  })

  it('rejects a message over the 300-char cap', async () => {
    const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

    await assertFails(
      setDoc(doc(adminDb, 'platformConfig', 'maintenance'), {
        enabled: true,
        message: 'x'.repeat(301),
        updatedAt: serverTimestamp(),
        updatedBy: 'admin-1',
      }),
    )
  })
})
