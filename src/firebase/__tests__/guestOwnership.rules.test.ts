import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collectionGroup, doc, getDoc, getDocs, limit, query, updateDoc, where } from 'firebase/firestore'
import {
  createTestEnv,
  getGuestDoc,
  seedEvent,
  seedGuest,
  seedGuestContact,
  type EmulatorFirestore,
} from './helpers'

// Mismo mock que guests.test.ts: redirige el `db` singleton de guests.ts/
// invitationRecovery.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { claimGuestOwnership } from '../guests'
import { reclaimInvitationsByEmail } from '../invitationRecovery'

const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'
const QR_TOKEN = 'qr-token-1'
const USER_UID = 'user-1'
const OTHER_UID = 'other-user'

// Cubre el mecanismo nuevo de "el pase pertenece a la cuenta" (ver
// firestore.rules, guests/{guestId} — allow update, rama de guestUid) que
// resuelve el problema de fondo reportado: un invitado se autoregistra desde
// el navegador integrado de Instagram, ese navegador borra su localStorage
// antes de que vuelva a abrir el pase, y crea/usa su cuenta de PaseLink
// desde otro navegador — sin esto, esa invitación quedaba huérfana para
// siempre. Dos caminos:
// - claimGuestOwnership: abrir el pase ya logueado (necesita conocer el
//   (eventId, guestId), igual que cualquier otra acción propia del invitado
//   en este archivo — ver el comentario de esta rama en firestore.rules).
// - reclaimInvitationsByEmail: encontrar un pase que la cuenta NUNCA abrió,
//   cruzando su email VERIFICADO contra guestContacts (collectionGroup). Acá
//   sí hay una puerta real que proteger — es la única forma de DESCUBRIR un
//   guestId nuevo — por eso `guestContacts` exige email_verified y
//   coincidencia exacta para permitir esa consulta (ver su `allow list`).
describe('guestUid — vínculo pase↔cuenta', () => {
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

  describe('claimGuestOwnership (abrir el pase ya logueado)', () => {
    it('claims an unowned pass for the authenticated caller', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      dbHolder.db = testEnv.authenticatedContext(USER_UID).firestore()

      await claimGuestOwnership(EVENT_ID, GUEST_ID, USER_UID, null)

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBe(USER_UID)
    })

    it('is a silent no-op when the pass already belongs to this same account', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: USER_UID })
      dbHolder.db = testEnv.authenticatedContext(USER_UID).firestore()

      await expect(claimGuestOwnership(EVENT_ID, GUEST_ID, USER_UID, USER_UID)).resolves.not.toThrow()

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBe(USER_UID)
    })

    it('never overwrites a pass already claimed by a different account (no hijacking)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: OTHER_UID })
      dbHolder.db = testEnv.authenticatedContext(USER_UID).firestore()

      // El cliente cree que está sin dueño (currentGuestUid=null, estado
      // local desactualizado) — igual debe fallar silenciosamente, nunca
      // reventar la carga del pase.
      await expect(claimGuestOwnership(EVENT_ID, GUEST_ID, USER_UID, null)).resolves.not.toThrow()

      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBe(OTHER_UID)
    })

    it('allows any authenticated user to claim an unowned pass (bearer-link trust, same as the rest of this file)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      const callerDb = testEnv.authenticatedContext(USER_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(callerDb, 'events', EVENT_ID, 'guests', GUEST_ID), { guestUid: USER_UID }),
      )
    })

    it('rejects claiming a pass that is already owned by someone else', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: OTHER_UID })
      const callerDb = testEnv.authenticatedContext(USER_UID).firestore()

      await assertFails(
        updateDoc(doc(callerDb, 'events', EVENT_ID, 'guests', GUEST_ID), { guestUid: USER_UID }),
      )
    })

    it('rejects claiming for a different uid than the caller\'s own', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      const callerDb = testEnv.authenticatedContext(USER_UID).firestore()

      await assertFails(
        updateDoc(doc(callerDb, 'events', EVENT_ID, 'guests', GUEST_ID), { guestUid: OTHER_UID }),
      )
    })

    it('rejects a write that bundles guestUid with any other field', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null, name: 'Ana' })
      const callerDb = testEnv.authenticatedContext(USER_UID).firestore()

      await assertFails(
        updateDoc(doc(callerDb, 'events', EVENT_ID, 'guests', GUEST_ID), { guestUid: USER_UID, name: 'Hackeado' }),
      )
    })

    it('rejects an unauthenticated claim attempt', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(anonDb, 'events', EVENT_ID, 'guests', GUEST_ID), { guestUid: USER_UID }),
      )
    })
  })

  describe('guestContacts — allow list (la puerta de descubrimiento por email)', () => {
    it('allows a collectionGroup query filtered by the caller\'s own verified email', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      const callerDb = testEnv
        .authenticatedContext(USER_UID, { email: 'ana@example.com', email_verified: true })
        .firestore()

      await assertSucceeds(
        getDocs(query(collectionGroup(callerDb, 'guestContacts'), where('email', '==', 'ana@example.com'), limit(25))),
      )
    })

    it('rejects the same query when the account email is not verified', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      const callerDb = testEnv
        .authenticatedContext(USER_UID, { email: 'ana@example.com', email_verified: false })
        .firestore()

      await assertFails(
        getDocs(query(collectionGroup(callerDb, 'guestContacts'), where('email', '==', 'ana@example.com'), limit(25))),
      )
    })

    it('rejects a query for an email other than the caller\'s own (can\'t enumerate other people\'s contacts)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      const callerDb = testEnv
        .authenticatedContext(USER_UID, { email: 'someone-else@example.com', email_verified: true })
        .firestore()

      await assertFails(
        getDocs(query(collectionGroup(callerDb, 'guestContacts'), where('email', '==', 'ana@example.com'), limit(25))),
      )
    })

    it('rejects an unauthenticated query', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        getDocs(query(collectionGroup(anonDb, 'guestContacts'), where('email', '==', 'ana@example.com'), limit(25))),
      )
    })
  })

  describe('reclaimInvitationsByEmail (recuperación entre dispositivos)', () => {
    it('claims a guest whose contact email matches the verified account email, case-insensitively', async () => {
      await seedEvent(testEnv, EVENT_ID, { name: 'Fiesta', date: '2027-01-01', location: 'Salón' })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null, name: 'Ana', lastName: 'Gómez' })
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      dbHolder.db = testEnv.authenticatedContext(USER_UID, { email: 'Ana@Example.com', email_verified: true }).firestore()

      const claimed = await reclaimInvitationsByEmail(USER_UID, 'Ana@Example.com')

      expect(claimed).toBe(1)
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBe(USER_UID)
      let invitation: Record<string, unknown> | undefined
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snap = await getDoc(doc(context.firestore(), 'users', USER_UID, 'invitations', EVENT_ID))
        invitation = snap.data()
      })
      expect(invitation?.qrToken).toBe(QR_TOKEN)
    })

    it('does not claim anything when the account email is not verified', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      dbHolder.db = testEnv.authenticatedContext(USER_UID, { email: 'ana@example.com', email_verified: false }).firestore()

      const claimed = await reclaimInvitationsByEmail(USER_UID, 'ana@example.com')

      expect(claimed).toBe(0)
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBeNull()
    })

    it('does not touch a pass already claimed by a different account', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: OTHER_UID })
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
      dbHolder.db = testEnv.authenticatedContext(USER_UID, { email: 'ana@example.com', email_verified: true }).firestore()

      const claimed = await reclaimInvitationsByEmail(USER_UID, 'ana@example.com')

      expect(claimed).toBe(0)
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.guestUid).toBe(OTHER_UID)
    })

    it('finds nothing for an email with no matching guestContacts', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { qrToken: QR_TOKEN, guestUid: null })
      await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'someone-else@example.com' })
      dbHolder.db = testEnv.authenticatedContext(USER_UID, { email: 'ana@example.com', email_verified: true }).firestore()

      const claimed = await reclaimInvitationsByEmail(USER_UID, 'ana@example.com')

      expect(claimed).toBe(0)
    })
  })
})
