// Tests de Firestore Rules para las 2 ramas nuevas de reconfirmación en
// events/{eventId}/guests/{guestId} — ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md
// Fase 2. No hay todavía src/firebase/reconfirm.ts (llega más adelante en
// esta misma fase), así que se prueban las reglas directo con el SDK de
// cliente, mismo patrón que waitlist.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, updateDoc } from 'firebase/firestore'
import { createTestEnv, getGuestDoc, seedEvent, seedGuest } from './helpers'

const OWNER_UID = 'owner-uid'
const OUTSIDER_UID = 'outsider-uid'
const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'

describe('firestore.rules — reconfirmación (guests/{guestId})', () => {
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

  describe('el invitado confirma ("Sí, voy a asistir")', () => {
    it('allows the guest (matching lockToken) to move from requested to confirmed', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        reconfirmStatus: 'requested', reconfirmDeadline: Date.now() + 86_400_000,
        lockTokens: ['device-1'],
      })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertSucceeds(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'confirmed',
        lockToken: 'device-1',
      }))
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.reconfirmStatus).toBe('confirmed')
    })

    it('rejects a mismatched lockToken (not a recognized device for this pass)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        reconfirmStatus: 'requested', lockTokens: ['device-1'],
      })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'confirmed',
        lockToken: 'someone-elses-device',
      }))
    })

    it('rejects confirming when there is no active request (no campaign)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: ['device-1'] })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'confirmed',
        lockToken: 'device-1',
      }))
    })

    it('rejects the guest trying to fabricate "requested" or "expired" themselves', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, {
        reconfirmStatus: 'requested', lockTokens: ['device-1'],
      })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(updateDoc(doc(publicDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'expired',
        lockToken: 'device-1',
      }))
    })
  })

  describe('el organizador da más tiempo', () => {
    // Un coanfitrión con SOLO addGuests (sin editGuests) es el caso real que
    // esta rama tiene que cubrir — el dueño (o un coanfitrión CON
    // editGuests) ya puede escribir cualquier campo vía la rama general de
    // arriba, sin restricción, así que probar contra el dueño no ejercita
    // esta rama nueva en absoluto (ver el bug real que esto mismo destapó:
    // la primera versión de este test usaba OWNER_UID y "pasaba" incluso
    // cuando la rama nueva debía rechazarlo, porque el dueño ni siquiera
    // necesitaba de esta rama para lograrlo).
    const COORG_UID = 'coorg-uid'

    function seedEventWithLimitedCoOrganizer(overrides: Record<string, unknown> = {}) {
      return seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { [COORG_UID]: true },
        coOrganizerPermissions: { [COORG_UID]: { addGuests: true, editGuests: false } },
        ...overrides,
      })
    }

    it('allows a co-organizer with addGuests (but not editGuests) to reset an expired guest back to requested', async () => {
      await seedEventWithLimitedCoOrganizer()
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { reconfirmStatus: 'expired', reconfirmDeadline: 1000 })
      const coorgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      const newDeadline = Date.now() + 172_800_000
      await assertSucceeds(updateDoc(doc(coorgDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'requested',
        reconfirmDeadline: newDeadline,
      }))
      const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
      expect(guest?.reconfirmStatus).toBe('requested')
      expect(guest?.reconfirmDeadline).toBe(newDeadline)
    })

    it('rejects that same co-organizer trying to write confirmed/expired directly via this branch', async () => {
      await seedEventWithLimitedCoOrganizer()
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { reconfirmStatus: 'expired' })
      const coorgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(updateDoc(doc(coorgDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'confirmed',
        reconfirmDeadline: Date.now(),
      }))
    })

    it('rejects a co-organizer without addGuests permission', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { [COORG_UID]: true },
        coOrganizerPermissions: { [COORG_UID]: { addGuests: false, editGuests: false } },
      })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { reconfirmStatus: 'expired' })
      const coorgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(updateDoc(doc(coorgDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'requested',
        reconfirmDeadline: Date.now() + 86_400_000,
      }))
    })

    it('rejects an outsider (not owner, not co-organizer)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { reconfirmStatus: 'expired' })
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()

      await assertFails(updateDoc(doc(outsiderDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        reconfirmStatus: 'requested',
        reconfirmDeadline: Date.now() + 86_400_000,
      }))
    })
  })
})
