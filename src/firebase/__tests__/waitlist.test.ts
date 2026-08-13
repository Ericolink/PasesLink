// Tests de Firestore Rules para events/{eventId}/waitlist/{entryId} — no hay
// todavía un src/firebase/waitlist.ts (llega en la Fase 5 de
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md), así que este archivo prueba las
// reglas directamente con el SDK de cliente, mismo patrón que el test
// "rules should reject a raw write..." de capacity.test.ts.
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { createTestEnv, getWaitlistDoc, seedEvent, seedWaitlistEntry } from './helpers'

const OWNER_UID = 'owner-uid'
const OUTSIDER_UID = 'outsider-uid'
const EVENT_ID = 'event-1'

// registrationSource: 'self' por defecto — anotarse a la lista de espera es
// siempre autoservicio (ver GuestData.registrationSource /
// WaitlistEntryData.registrationSource), incluso en los tests de "create
// (organizador)" más abajo: isValidOrganizerWaitlistEntryData también acepta
// 'self' (moveGuestToWaitlist copia el origen que ya tenía el invitado, que
// puede ser cualquiera de los dos) — solo isValidWaitlistJoinData (alta
// pública) exige 'self' exacto.
function validJoinPayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Nuevo en la fila',
    partySize: 1,
    waitlistToken: 'token-abc',
    status: 'waiting',
    priorityBoost: 0,
    createdAt: serverTimestamp(),
    offerToken: null,
    offerExpiresAt: null,
    respondedAt: null,
    promotedGuestId: null,
    promotionReason: null,
    registrationSource: 'self',
    ...overrides,
  }
}

describe('firestore.rules — events/{eventId}/waitlist', () => {
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

  describe('create (alta pública)', () => {
    it('allows joining an open, full event', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertSucceeds(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('rejects joining when attendeeLimitEnabled is false — nothing would ever process this entry', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: false, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('rejects joining when the event is not open for self-registration', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'list', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('rejects a party size larger than maxCompanions + 1', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10, maxCompanions: 2 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ partySize: 4 })),
      )
    })

    it('rejects a client trying to fabricate an already-offered entry', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({
          status: 'offered',
          offerToken: 'fabricated-token',
          offerExpiresAt: Date.now() + 86_400_000,
        })),
      )
    })

    it('rejects a client trying to jump the queue at creation time', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ priorityBoost: 999 })),
      )
    })

    it('allows joining with answers to the event\'s custom fields (bug fix: this used to be silently dropped)', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertSucceeds(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({
          customData: { talla: 'M', alergias: 'Ninguna' },
        })),
      )
    })

    it('rejects an excessive number of custom fields (same cap as guest self-registration)', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      const tooMany = Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`field${i}`, 'x']))
      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ customData: tooMany })),
      )
    })

    it('rejects a public join claiming registrationSource: "organizer" — anotarse es siempre autoservicio', async () => {
      await seedEvent(testEnv, EVENT_ID, { entryMode: 'open', attendeeLimitEnabled: true, capacity: 10 })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ registrationSource: 'organizer' })),
      )
    })
  })

  describe('create (organizador — "Enviar a lista de espera", src/firebase/guests.ts moveGuestToWaitlist)', () => {
    it('allows the owner to create an entry even when the event is not open/hybrid or has no attendee limit — unlike public join, this path does not depend on those settings', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'list', attendeeLimitEnabled: false })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('allows a party size larger than maxCompanions + 1 — the guest already existed with that size, not re-pinned against the current limit', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'open', attendeeLimitEnabled: true, maxCompanions: 2 })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ partySize: 5 })),
      )
    })

    it('allows registrationSource: "organizer" too — moveGuestToWaitlist carries over whatever origin the guest already had', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'list', attendeeLimitEnabled: false })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ registrationSource: 'organizer' })),
      )
    })

    it('rejects a registrationSource that is neither "organizer" nor "self"', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'list', attendeeLimitEnabled: false })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({ registrationSource: 'admin' })),
      )
    })

    it('rejects an outsider (not owner, not co-organizer)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'list', attendeeLimitEnabled: false })
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()

      await assertFails(
        setDoc(doc(outsiderDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('rejects a co-organizer without deleteGuests permission', async () => {
      const COHOST_UID = 'cohost-uid'
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        entryMode: 'list',
        attendeeLimitEnabled: false,
        coOrganizersMap: { [COHOST_UID]: true },
        coOrganizerPermissions: { [COHOST_UID]: { deleteGuests: false } },
      })
      const cohostDb = testEnv.authenticatedContext(COHOST_UID).firestore()

      await assertFails(
        setDoc(doc(cohostDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload()),
      )
    })

    it('rejects a client trying to fabricate an already-offered entry through this path too', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, entryMode: 'list', attendeeLimitEnabled: false })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(
        setDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validJoinPayload({
          status: 'offered',
          offerToken: 'fabricated-token',
        })),
      )
    })
  })

  describe('read (por token, sin exponer al resto de la fila)', () => {
    it('allows fetching a single entry by its known document id', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const publicDb = testEnv.unauthenticatedContext().firestore()

      await assertSucceeds(getDoc(doc(publicDb, 'events', EVENT_ID, 'waitlist', 'entry-1')))
    })

    it('allows a limit(1) query by waitlistToken (the real access mechanism for the status page)', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1', { waitlistToken: 'secret-token' })
      const publicDb = testEnv.unauthenticatedContext().firestore()

      const q = query(collection(publicDb, 'events', EVENT_ID, 'waitlist'), where('waitlistToken', '==', 'secret-token'), limit(1))
      const snap = await assertSucceeds(getDocs(q))
      expect(snap.docs).toHaveLength(1)
    })

    it('rejects listing the queue without a limit(1) cap — can\'t enumerate who else is waiting', async () => {
      await seedEvent(testEnv, EVENT_ID)
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-2')
      const publicDb = testEnv.unauthenticatedContext().firestore()

      const q = query(collection(publicDb, 'events', EVENT_ID, 'waitlist'), limit(50))
      await assertFails(getDocs(q))
    })
  })

  describe('list (organizador — WaitlistPanel.tsx / subscribeToWaitlist, sin limit(1))', () => {
    // Bug real encontrado en producción: la única rama de `allow list` era
    // la de limit(1) (arriba) — el organizador nunca pudo cargar el panel
    // de la lista de espera, sin ningún error visible (el panel se oculta
    // solo cuando la lista de entradas queda vacía, indistinguible de "no
    // hay nadie esperando"). Cada test arma la misma consulta que usa
    // subscribeToWaitlist en src/firebase/waitlist.ts (sin limit()) inline
    // — mismo estilo que el resto de este archivo, sin extraer un helper
    // tipado (el tipo de retorno de `context.firestore()` no coincide con
    // el `Firestore` modular de firebase/firestore, aunque ambos funcionan
    // igual en tiempo de ejecución).
    it('allows the owner to list the full queue', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-2', { status: 'offered', offerToken: 'token-1' })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      const q = query(
        collection(ownerDb, 'events', EVENT_ID, 'waitlist'),
        where('status', 'in', ['waiting', 'offered']),
        orderBy('priorityBoost', 'desc'),
        orderBy('createdAt', 'asc'),
      )
      const snap = await assertSucceeds(getDocs(q))
      expect(snap.docs).toHaveLength(2)
    })

    it('allows a co-organizer with viewGuestList permission (default true, no explicit entry)', async () => {
      const COHOST_UID = 'cohost-uid'
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, coOrganizersMap: { [COHOST_UID]: true } })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const cohostDb = testEnv.authenticatedContext(COHOST_UID).firestore()

      const q = query(
        collection(cohostDb, 'events', EVENT_ID, 'waitlist'),
        where('status', 'in', ['waiting', 'offered']),
        orderBy('priorityBoost', 'desc'),
        orderBy('createdAt', 'asc'),
      )
      await assertSucceeds(getDocs(q))
    })

    it('rejects a co-organizer without viewGuestList permission', async () => {
      const COHOST_UID = 'cohost-uid'
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { [COHOST_UID]: true },
        coOrganizerPermissions: { [COHOST_UID]: { viewGuestList: false } },
      })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const cohostDb = testEnv.authenticatedContext(COHOST_UID).firestore()

      const q = query(
        collection(cohostDb, 'events', EVENT_ID, 'waitlist'),
        where('status', 'in', ['waiting', 'offered']),
        orderBy('priorityBoost', 'desc'),
        orderBy('createdAt', 'asc'),
      )
      await assertFails(getDocs(q))
    })

    it('rejects an outsider (not owner, not co-organizer)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()

      const q = query(
        collection(outsiderDb, 'events', EVENT_ID, 'waitlist'),
        where('status', 'in', ['waiting', 'offered']),
        orderBy('priorityBoost', 'desc'),
        orderBy('createdAt', 'asc'),
      )
      await assertFails(getDocs(q))
    })
  })

  describe('update (organizador: mover al frente / quitar — todo lo demás es exclusivo de Cloud Functions)', () => {
    it('allows the owner to bump priorityBoost upward on a waiting entry', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1', { priorityBoost: 0 })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), { priorityBoost: 1 }))
    })

    it('rejects lowering priorityBoost', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1', { priorityBoost: 5 })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), { priorityBoost: 1 }))
    })

    it('allows the owner to remove a waiting entry from the queue', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), { status: 'removed' }))
      const entry = await getWaitlistDoc(testEnv, EVENT_ID, 'entry-1')
      expect(entry?.status).toBe('removed')
    })

    it('rejects a raw client write promoting an entry directly — that transition is exclusive to Cloud Functions', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), {
        status: 'promoted',
        promotedGuestId: 'fabricated-guest-id',
      }))
    })

    it('rejects a raw client write fabricating an offer', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), {
        status: 'offered',
        offerToken: 'fabricated-token',
        offerExpiresAt: Date.now() + 86_400_000,
      }))
    })

    it('rejects an outsider (not owner, not co-organizer) moving or removing entries', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()

      await assertFails(updateDoc(doc(outsiderDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), { priorityBoost: 1 }))
      await assertFails(updateDoc(doc(outsiderDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), { status: 'removed' }))
    })
  })

  describe('update (organizador: "Modificar pase" — rediseño de la Waitlist)', () => {
    function validEditPayload(overrides: Record<string, unknown> = {}) {
      return {
        name: 'Editado',
        partySize: 2,
        phone: '5555555555',
        phoneCountry: 'MX',
        email: 'editado@test.com',
        whatsappConsent: true,
        customData: {},
        ...overrides,
      }
    }

    it('allows the owner to edit a waiting entry', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, maxCompanions: 5 })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload()))
      const entry = await getWaitlistDoc(testEnv, EVENT_ID, 'entry-1')
      expect(entry?.name).toBe('Editado')
      expect(entry?.partySize).toBe(2)
      expect(entry?.phone).toBe('5555555555')
    })

    it('rejects editing an entry that already has an active offer — not mid-confirmation', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1', { status: 'offered', offerToken: 'token-1' })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload()))
    })

    it('rejects a party size beyond maxCompanions + 1', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, maxCompanions: 2 })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload({ partySize: 10 })))
    })

    it('rejects sneaking a status/priorityBoost change into the same write as an edit', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(
        updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload({ status: 'promoted' })),
      )
      await assertFails(
        updateDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload({ priorityBoost: 99 })),
      )
    })

    it('rejects a co-organizer without addGuests permission', async () => {
      const COHOST_UID = 'cohost-uid'
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { [COHOST_UID]: true },
        coOrganizerPermissions: { [COHOST_UID]: { addGuests: false } },
      })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const cohostDb = testEnv.authenticatedContext(COHOST_UID).firestore()

      await assertFails(updateDoc(doc(cohostDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload()))
    })

    it('allows a co-organizer with addGuests permission', async () => {
      const COHOST_UID = 'cohost-uid'
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { [COHOST_UID]: true },
        coOrganizerPermissions: { [COHOST_UID]: { addGuests: true } },
      })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const cohostDb = testEnv.authenticatedContext(COHOST_UID).firestore()

      await assertSucceeds(updateDoc(doc(cohostDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload()))
    })

    it('rejects an outsider', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const outsiderDb = testEnv.authenticatedContext(OUTSIDER_UID).firestore()

      await assertFails(updateDoc(doc(outsiderDb, 'events', EVENT_ID, 'waitlist', 'entry-1'), validEditPayload()))
    })
  })

  describe('delete', () => {
    it('rejects any client delete — "quitar" es un update a status:removed, no un borrado', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedWaitlistEntry(testEnv, EVENT_ID, 'entry-1')
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(deleteDoc(doc(ownerDb, 'events', EVENT_ID, 'waitlist', 'entry-1')))
    })
  })
})
