import { afterAll, afterEach, beforeAll, beforeEach, describe, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collectionGroup, doc, getDoc, getDocs, limit, orderBy, query, setDoc, updateDoc, where } from 'firebase/firestore'
import { createTestEnv, seedEvent } from './helpers'

// Cubre las reglas nuevas del Centro de Control del admin (Fase 1): 4
// lecturas collectionGroup (sendLog/notificationQueue/csvImportJobs/guests,
// ver src/firebase/adminAlerts.ts y adminActivity.ts), sendBudget pasando a
// legible por admin, y los contadores nuevos platformStats/deviceStats.
// Todo vía llamadas directas al SDK contra el emulador (no hay wrapper en
// admin.ts todavía para las collectionGroup — esas llegan en la Fase 2) —
// mismo estilo que guestOwnership.rules.test.ts.
const EVENT_ID = 'event-1'

describe('Centro de Control — reglas nuevas', () => {
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

  describe('sendBudget', () => {
    it('allows an admin to read today\'s budget', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'sendBudget', '2026-08-06'), { count: 42 })
      })
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(getDoc(doc(adminDb, 'sendBudget', '2026-08-06')))
    })

    it('rejects a non-admin from reading the budget', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'sendBudget', '2026-08-06'), { count: 42 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(getDoc(doc(userDb, 'sendBudget', '2026-08-06')))
    })
  })

  describe('platformStats', () => {
    it('allows an admin to read the funnel counter', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'platformStats', 'funnel'), { usersWithEventsCount: 3 })
      })
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(getDoc(doc(adminDb, 'platformStats', 'funnel')))
    })

    it('rejects a non-admin from reading the funnel counter', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'platformStats', 'funnel'), { usersWithEventsCount: 3 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(getDoc(doc(userDb, 'platformStats', 'funnel')))
    })

    it('rejects a client write, even from an admin — only the onEventCreated trigger writes this', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertFails(setDoc(doc(adminDb, 'platformStats', 'funnel'), { usersWithEventsCount: 99 }))
    })
  })

  describe('deviceStats', () => {
    it('lets any authenticated user create a bucket with count 1', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertSucceeds(
        setDoc(doc(userDb, 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 1 }),
      )
    })

    it('rejects creating a bucket outside the closed enum', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(
        setDoc(doc(userDb, 'deviceStats', 'os_freebsd'), { kind: 'os', key: 'freebsd', count: 1 }),
      )
    })

    it('rejects creating a bucket with count != 1', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(
        setDoc(doc(userDb, 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 2 }),
      )
    })

    it('allows a +1 increment update', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 1 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertSucceeds(updateDoc(doc(userDb, 'deviceStats', 'os_android'), { count: 2 }))
    })

    it('rejects a non-consecutive increment', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 1 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(updateDoc(doc(userDb, 'deviceStats', 'os_android'), { count: 3 }))
    })

    it('rejects an update that touches another field besides count', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 1 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(updateDoc(doc(userDb, 'deviceStats', 'os_android'), { count: 2, key: 'ios' }))
    })

    it('rejects reading the breakdown for a non-admin', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'deviceStats', 'os_android'), { kind: 'os', key: 'android', count: 1 })
      })
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(getDoc(doc(userDb, 'deviceStats', 'os_android')))
    })
  })

  describe('collectionGroup: sendLog / notificationQueue / csvImportJobs / guests', () => {
    beforeEachSeed()

    it('lets an admin list recent failed sendLog entries across events', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(
        getDocs(
          query(collectionGroup(adminDb, 'sendLog'), where('status', 'in', ['failed', 'skipped_budget']), orderBy('sentAt', 'desc'), limit(20)),
        ),
      )
    })

    it('rejects a non-admin from listing sendLog across events', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(
        getDocs(
          query(collectionGroup(userDb, 'sendLog'), where('status', 'in', ['failed', 'skipped_budget']), orderBy('sentAt', 'desc'), limit(20)),
        ),
      )
    })

    it('lets an admin list failed notificationQueue entries across events', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(
        getDocs(query(collectionGroup(adminDb, 'notificationQueue'), where('status', '==', 'failed'), orderBy('createdAt', 'desc'), limit(20))),
      )
    })

    it('rejects a non-admin from listing notificationQueue across events', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(
        getDocs(query(collectionGroup(userDb, 'notificationQueue'), where('status', '==', 'failed'), orderBy('createdAt', 'desc'), limit(20))),
      )
    })

    it('lets an admin list failed csvImportJobs across events', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(
        getDocs(
          query(collectionGroup(adminDb, 'csvImportJobs'), where('status', 'in', ['failed', 'completed_with_errors']), orderBy('createdAt', 'desc'), limit(20)),
        ),
      )
    })

    it('rejects a non-admin from listing csvImportJobs across events', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(
        getDocs(
          query(collectionGroup(userDb, 'csvImportJobs'), where('status', 'in', ['failed', 'completed_with_errors']), orderBy('createdAt', 'desc'), limit(20)),
        ),
      )
    })

    it('lets an admin list recent guest registrations across events (activity feed)', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertSucceeds(getDocs(query(collectionGroup(adminDb, 'guests'), orderBy('createdAt', 'desc'), limit(20))))
    })

    it('rejects a non-admin from listing guests across events, even with a small limit', async () => {
      const userDb = testEnv.authenticatedContext('user-1').firestore()

      await assertFails(getDocs(query(collectionGroup(userDb, 'guests'), orderBy('createdAt', 'desc'), limit(20))))
    })

    it('rejects an admin query that exceeds the limit cap', async () => {
      const adminDb = testEnv.authenticatedContext('admin-1', { admin: true }).firestore()

      await assertFails(getDocs(query(collectionGroup(adminDb, 'guests'), orderBy('createdAt', 'desc'), limit(21))))
    })
  })

  // Helper local: siembra un evento + un doc en cada subcolección relevante,
  // para que las queries collectionGroup tengan algo (aunque sea vacío) que
  // recorrer sin fallar por otra razón que no sea la regla misma.
  function beforeEachSeed() {
    beforeEach(async () => {
      await seedEvent(testEnv, EVENT_ID)
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore()
        await setDoc(doc(db, 'events', EVENT_ID, 'sendLog', 'log-1'), {
          channel: 'email',
          kind: 'reminder',
          toEmail: 'a@test.com',
          status: 'failed',
          sentAt: Date.now(),
        })
        await setDoc(doc(db, 'events', EVENT_ID, 'notificationQueue', 'notif-1'), {
          eventId: EVENT_ID,
          type: 'rsvp_new',
          status: 'failed',
          createdAt: Date.now(),
        })
        await setDoc(doc(db, 'events', EVENT_ID, 'csvImportJobs', 'job-1'), {
          status: 'failed',
          errorMessage: 'archivo inválido',
          successCount: 0,
          failedCount: 5,
          createdAt: Date.now(),
        })
      })
    })
  }
})
