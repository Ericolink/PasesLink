import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, deleteDoc, deleteField, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import {
  createTestEnv,
  getConcessionItemDoc,
  getConcessionOrderDoc,
  getEventDoc,
  getGuestDoc,
  seedConcessionItem,
  seedConcessionOrder,
  seedEvent,
  seedGuest,
} from './helpers'

// Fase 3 de ROLES_PERMISSIONS_REDESIGN.md: firestore.rules aprende a leer
// event.collaborators (modelo unificado, ver src/types/collaboratorPermissions.ts
// y functions/src/lib/permissions.ts) además de los tres mapas legacy
// (coOrganizersMap+coOrganizerPermissions, concessions.concessionsStaffMap).
// Este archivo NO repite la cobertura ya existente de esos sistemas legacy
// (ver checkInSecurity.rules.test.ts, concessions.rules.test.ts) — solo
// cubre las ramas nuevas: resolución por rol vía `collaborators`,
// permissionOverrides, prioridad sobre los mapas legacy, y el bloqueo de
// collaboratorInvites.
const EVENT_ID = 'event-1'
const OWNER_UID = 'owner-uid'
const GUEST_ID = 'guest-1'
const ITEM_ID = 'item-soda'
const ORDER_ID = 'order-1'

const enabledConcessions = {
  enabled: true,
  currency: 'MXN',
  paymentMethods: ['transfer', 'cash'],
  useEventPaymentInstructions: true,
}

async function seedWallMessage(testEnv: RulesTestEnvironment, messageId: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'wall', messageId), {
      text: 'Mensaje de prueba',
      type: 'comment',
      authorName: 'Invitado',
      authorToken: 'guest-token',
      authorRole: 'guest',
      authorPhotoURL: null,
      reactionCount: 0,
      reactionCountsByType: {},
      replies: [],
      deleted: false,
      pinned: false,
      createdAt: Date.now(),
    })
  })
}

describe('event.collaborators (modelo unificado de roles)', () => {
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

  describe('guests/{guestId} — editGuests', () => {
    it('un colaborador con rol administrador puede editar un invitado', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: { 'admin-uid': { role: 'administrador', email: 'a@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      // lockTokens ya "reclamado" por otro dispositivo: cierra la rama de
      // autoedición del propio invitado (guests/{guestId} allow update,
      // hasOnly(['name','lastName','companions',...,'version','updatedAt']))
      // que de otro modo pasaría trivialmente para CUALQUIER caller sin rol
      // — este test necesita forzar el paso por la rama de editGuests.
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [], lockTokens: ['someone-elses-device'] })
      const db = testEnv.authenticatedContext('admin-uid').firestore()

      await assertSucceeds(
        updateDoc(doc(db, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Nombre editado',
          version: 1,
          updatedAt: serverTimestamp(),
        }),
      )
      expect((await getGuestDoc(testEnv, EVENT_ID, GUEST_ID))?.name).toBe('Nombre editado')
    })

    it('un colaborador con rol recepción NO puede editar un invitado (fuera de su preset)', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: { 'recep-uid': { role: 'recepcion', email: 'r@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      // lockTokens ya "reclamado" por otro dispositivo: cierra la rama de
      // autoedición del propio invitado (guests/{guestId} allow update,
      // hasOnly(['name','lastName','companions',...,'version','updatedAt']))
      // que de otro modo pasaría trivialmente para CUALQUIER caller sin rol
      // — este test necesita forzar el paso por la rama de editGuests.
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [], lockTokens: ['someone-elses-device'] })
      const db = testEnv.authenticatedContext('recep-uid').firestore()

      await assertFails(
        updateDoc(doc(db, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Nombre editado',
          version: 1,
          updatedAt: serverTimestamp(),
        }),
      )
      expect((await getGuestDoc(testEnv, EVENT_ID, GUEST_ID))?.name).toBe('Invitado de prueba')
    })
  })

  describe('wall/{messageId} — moderateWall', () => {
    it('un colaborador con rol administrador puede borrar un mensaje del muro', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: { 'admin-uid': { role: 'administrador', email: 'a@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedWallMessage(testEnv, 'msg-1')
      const db = testEnv.authenticatedContext('admin-uid').firestore()

      await assertSucceeds(deleteDoc(doc(db, 'events', EVENT_ID, 'wall', 'msg-1')))
    })

    it('un colaborador con rol ventas NO puede moderar el muro', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: { 'ventas-uid': { role: 'ventas', email: 'v@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedWallMessage(testEnv, 'msg-1')
      const db = testEnv.authenticatedContext('ventas-uid').firestore()
      const { deleteDoc } = await import('firebase/firestore')

      await assertFails(deleteDoc(doc(db, 'events', EVENT_ID, 'wall', 'msg-1')))
      let remaining = 0
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snap = await getDocs(collection(context.firestore(), 'events', EVENT_ID, 'wall'))
        remaining = snap.docs.length
      })
      expect(remaining).toBe(1)
    })
  })

  describe('concessionsCatalog/{itemId} — manageConcessions (rol ventas) y prep-only status (rol preparación)', () => {
    it('un colaborador con rol ventas puede editar precio/nombre del catálogo', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: { 'ventas-uid': { role: 'ventas', email: 'v@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID)
      const db = testEnv.authenticatedContext('ventas-uid').firestore()

      await assertSucceeds(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { priceMinorUnits: 5000, name: 'Soda editada' }))
      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.priceMinorUnits).toBe(5000)
    })

    it('un colaborador con rol preparación solo puede tocar `status`, nunca precio ni nombre', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: { 'prep-uid': { role: 'preparacion', email: 'p@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID)
      const db = testEnv.authenticatedContext('prep-uid').firestore()

      await assertSucceeds(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { status: 'outOfStock' }))
      await assertFails(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { priceMinorUnits: 1 }))
    })

    it('un colaborador con rol caja NO tiene ningún acceso al catálogo', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: { 'caja-uid': { role: 'caja', email: 'c@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID)
      const db = testEnv.authenticatedContext('caja-uid').firestore()

      await assertFails(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { status: 'outOfStock' }))
    })
  })

  describe('concessionsOrders/{orderId} — confirmPayments (rol caja) y permissionOverrides', () => {
    it('un colaborador con rol caja puede confirmar un pedido', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: { 'caja-uid': { role: 'caja', email: 'c@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedConcessionOrder(testEnv, EVENT_ID, ORDER_ID)
      const db = testEnv.authenticatedContext('caja-uid').firestore()

      await assertSucceeds(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsOrders', ORDER_ID), { paymentPhase: 'confirmed', paidAt: Date.now() }))
      expect((await getConcessionOrderDoc(testEnv, EVENT_ID, ORDER_ID))?.paymentPhase).toBe('confirmed')
    })

    it('un colaborador con rol recepción, sin override, NO puede confirmar pagos de ventas', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: { 'recep-uid': { role: 'recepcion', email: 'r@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      await seedConcessionOrder(testEnv, EVENT_ID, ORDER_ID)
      const db = testEnv.authenticatedContext('recep-uid').firestore()

      await assertFails(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsOrders', ORDER_ID), { paymentPhase: 'confirmed' }))
    })

    it('un colaborador con rol recepción y permissionOverrides.confirmPayments=true SÍ puede confirmar pagos', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        collaborators: {
          'recep-uid': {
            role: 'recepcion',
            email: 'r@test.com',
            invitedBy: OWNER_UID,
            invitedAt: 1,
            permissionOverrides: { confirmPayments: true },
          },
        },
      })
      await seedConcessionOrder(testEnv, EVENT_ID, ORDER_ID)
      const db = testEnv.authenticatedContext('recep-uid').firestore()

      await assertSucceeds(updateDoc(doc(db, 'events', EVENT_ID, 'concessionsOrders', ORDER_ID), { paymentPhase: 'confirmed' }))
    })
  })

  describe('prioridad: event.collaborators gana sobre coOrganizersMap legacy', () => {
    it('un uid presente en ambos mapas usa el rol nuevo (caja), no LEGACY_COORG_DEFAULTS', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        coOrganizersMap: { 'dual-uid': 'dual@test.com' }, // LEGACY_COORG_DEFAULTS.editGuests == true
        collaborators: { 'dual-uid': { role: 'caja', email: 'dual@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      // lockTokens ya "reclamado" por otro dispositivo: cierra la rama de
      // autoedición del propio invitado (guests/{guestId} allow update,
      // hasOnly(['name','lastName','companions',...,'version','updatedAt']))
      // que de otro modo pasaría trivialmente para CUALQUIER caller sin rol
      // — este test necesita forzar el paso por la rama de editGuests.
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [], lockTokens: ['someone-elses-device'] })
      const db = testEnv.authenticatedContext('dual-uid').firestore()

      // Si ganara el mapa legacy, esto tendría que SUCCEED (editGuests=true ahí).
      await assertFails(
        updateDoc(doc(db, 'events', EVENT_ID, 'guests', GUEST_ID), {
          name: 'Nombre editado',
          version: 1,
          updatedAt: serverTimestamp(),
        }),
      )
    })
  })

  describe('events/{eventId} — administrar/salir de event.collaborators (Fase 4)', () => {
    it('el dueño puede agregar y quitar colaboradores directo (updateDoc)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      const db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(db, 'events', EVENT_ID), {
          'collaborators.new-uid': { email: 'n@test.com', role: 'caja', invitedBy: OWNER_UID, invitedAt: 1 },
          updatedAt: serverTimestamp(),
        }),
      )
      let event = await getEventDoc(testEnv, EVENT_ID)
      expect((event?.collaborators as Record<string, { role: string }> | undefined)?.['new-uid']?.role).toBe('caja')

      await assertSucceeds(
        updateDoc(doc(db, 'events', EVENT_ID), { 'collaborators.new-uid': deleteField(), updatedAt: serverTimestamp() }),
      )
      event = await getEventDoc(testEnv, EVENT_ID)
      expect((event?.collaborators as Record<string, unknown> | undefined)?.['new-uid']).toBeUndefined()
    })

    it('un colaborador con rol administrador puede administrar a OTROS colaboradores, pero no su propia entrada', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: { 'admin-uid': { role: 'administrador', email: 'a@test.com', invitedBy: OWNER_UID, invitedAt: 1 } },
      })
      const db = testEnv.authenticatedContext('admin-uid').firestore()

      await assertSucceeds(
        updateDoc(doc(db, 'events', EVENT_ID), {
          'collaborators.new-uid': { email: 'n@test.com', role: 'preparacion', invitedBy: 'admin-uid', invitedAt: 1 },
          updatedAt: serverTimestamp(),
        }),
      )

      // Autoescalada/autoedición por esta vía: bloqueada — mismo criterio
      // que ya protege coOrganizersMap/coOrganizerPermissions.
      await assertFails(
        updateDoc(doc(db, 'events', EVENT_ID), {
          'collaborators.admin-uid': { email: 'a@test.com', role: 'administrador', permissionOverrides: { manageCoOrganizers: true }, invitedBy: 'admin-uid', invitedAt: 1 },
          updatedAt: serverTimestamp(),
        }),
      )
    })

    it('un colaborador de rol angosto puede quitarse a sí mismo ("salir del evento") pero no a otros', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        collaborators: {
          'recep-uid': { role: 'recepcion', email: 'r@test.com', invitedBy: OWNER_UID, invitedAt: 1 },
          'caja-uid': { role: 'caja', email: 'c@test.com', invitedBy: OWNER_UID, invitedAt: 1 },
        },
      })
      const db = testEnv.authenticatedContext('recep-uid').firestore()

      await assertFails(
        updateDoc(doc(db, 'events', EVENT_ID), { 'collaborators.caja-uid': deleteField(), updatedAt: serverTimestamp() }),
      )
      await assertSucceeds(
        updateDoc(doc(db, 'events', EVENT_ID), { 'collaborators.recep-uid': deleteField(), updatedAt: serverTimestamp() }),
      )
    })
  })

  describe('collaboratorInvites/{token} — ilegible desde el cliente', () => {
    it('nadie puede leer ni escribir, ni siquiera el dueño del evento', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'events', EVENT_ID, 'collaboratorInvites', 'tok-1'), {
          createdBy: OWNER_UID,
          role: 'caja',
          usedBy: null,
        })
      })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(getDoc(doc(ownerDb, 'events', EVENT_ID, 'collaboratorInvites', 'tok-1')))
      await assertFails(updateDoc(doc(ownerDb, 'events', EVENT_ID, 'collaboratorInvites', 'tok-1'), { usedBy: OWNER_UID }))
    })
  })
})
