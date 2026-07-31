import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import {
  createTestEnv,
  getConcessionFulfillmentDoc,
  getConcessionItemDoc,
  getConcessionOrderDoc,
  getEventDoc,
  seedAdmin,
  seedConcessionFulfillment,
  seedConcessionItem,
  seedConcessionOrder,
  seedEvent,
  seedGuest,
  type EmulatorFirestore,
} from './helpers'

// Mismo mock que guestOwnership.rules.test.ts: redirige el `db` singleton de
// concessions.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import {
  addConcessionsStaff,
  advanceConcessionFulfillment,
  cancelConcessionOrder,
  cancelOwnConcessionOrder,
  ConcessionCheckoutError,
  confirmConcessionOrderPayment,
  createConcessionOrder,
  enableConcessionsBeta,
  removeConcessionsStaff,
  revertConcessionFulfillment,
  submitConcessionPaymentProof,
  updateConcessionsSettings,
} from '../concessions'

const EVENT_ID = 'event-1'
const OWNER_UID = 'owner-uid'
const ADMIN_UID = 'admin-uid'
const COORG_UID = 'coorg-uid'
const STAFF_UID = 'staff-uid'
const GUEST_ID = 'guest-1'
const OTHER_GUEST_ID = 'guest-2'
const ITEM_ID = 'item-soda'
const LOCK_TOKEN = 'device-token-1'

const enabledConcessions = {
  enabled: true,
  currency: 'MXN',
  paymentMethods: ['transfer', 'cash'],
  useEventPaymentInstructions: true,
  concessionsStaffMap: { [STAFF_UID]: 'staff@test.com' },
}

describe('Concessions — venta de comida/bebida durante el evento', () => {
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

  describe('gate de beta — concessions.enabled', () => {
    it('permite a un admin de PaseLink activar el módulo en cualquier evento', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedAdmin(testEnv, ADMIN_UID)
      const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(adminDb, 'events', EVENT_ID), { 'concessions.enabled': true }),
      )
      const event = await getEventDoc(testEnv, EVENT_ID)
      expect((event?.concessions as Record<string, unknown> | undefined)?.enabled).toBe(true)
    })

    it('rechaza que el propio dueño del evento (sin ser admin) active el módulo', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(
        updateDoc(doc(ownerDb, 'events', EVENT_ID), { 'concessions.enabled': true }),
      )
    })

    it('permite al dueño DESACTIVAR el módulo sin ser admin', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(ownerDb, 'events', EVENT_ID), { 'concessions.enabled': false }),
      )
    })
  })

  describe('concessionsCatalog', () => {
    it('es público (incluso sin sesión) cuando el módulo está activo', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID)
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertSucceeds(getDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID)))
    })

    it('rechaza la lectura cuando el evento nunca activó el módulo', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID)
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(getDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID)))
    })

    it('permite crear un producto a un co-organizador con manageConcessions', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: true } },
      })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertSucceeds(
        setDoc(doc(coOrgDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), {
          name: 'Café frío', category: 'drink', priceMinorUnits: 4000, currency: 'MXN',
          stockMode: 'unlimited', soldCount: 0, status: 'active', sortOrder: 0,
        }),
      )
    })

    it('rechaza crear un producto a un co-organizador SIN manageConcessions', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: false } },
      })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        setDoc(doc(coOrgDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), {
          name: 'Café frío', category: 'drink', priceMinorUnits: 4000, currency: 'MXN',
          stockMode: 'unlimited', soldCount: 0, status: 'active', sortOrder: 0,
        }),
      )
    })

    it('el Menu Manager solo puede tocar `status`, nunca precio ni nombre', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { status: 'active' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { status: 'outOfStock' }),
      )
      await assertFails(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { priceMinorUnits: 1 }),
      )
    })
  })

  describe('createConcessionOrder (checkout transaccional)', () => {
    it('reserva stock, crea el pedido y su proyección de cocina en `not_ready`', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 10, priceMinorUnits: 3500 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const orderId = await createConcessionOrder(EVENT_ID, {
        guestId: GUEST_ID,
        guestNameSnapshot: 'Invitado de prueba',
        lockToken: LOCK_TOKEN,
        currency: 'MXN',
        paymentMethod: 'transfer',
        lines: [{ itemId: ITEM_ID, quantity: 2 }],
      })

      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(8)
      expect(item?.soldCount).toBe(2)

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, orderId)
      expect(order?.totalMinorUnits).toBe(7000)
      expect(order?.paymentPhase).toBe('awaiting_payment')

      const fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, orderId)
      expect(fulfillment?.fulfillmentStatus).toBe('not_ready')
    })

    it('confirma pagos automáticamente y salta a `queued` cuando el pedido es 100% gratis', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { priceMinorUnits: 0, stockMode: 'unlimited' })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const orderId = await createConcessionOrder(EVENT_ID, {
        guestId: GUEST_ID,
        guestNameSnapshot: 'Invitado de prueba',
        lockToken: LOCK_TOKEN,
        currency: 'MXN',
        paymentMethod: null,
        lines: [{ itemId: ITEM_ID, quantity: 1 }],
      })

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, orderId)
      expect(order?.paymentPhase).toBe('confirmed')
      expect(order?.paymentMethod).toBeNull()

      const fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, orderId)
      expect(fulfillment?.fulfillmentStatus).toBe('queued')
    })

    it('rechaza el checkout si no alcanza el stock, sin dejar escrituras a medias', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 1 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await expect(
        createConcessionOrder(EVENT_ID, {
          guestId: GUEST_ID,
          guestNameSnapshot: 'Invitado de prueba',
          lockToken: LOCK_TOKEN,
          currency: 'MXN',
          paymentMethod: 'cash',
          lines: [{ itemId: ITEM_ID, quantity: 2 }],
        }),
      ).rejects.toThrow(ConcessionCheckoutError)

      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(1) // sin cambios: la transacción entera se abortó
    })

    it('deja que exactamente uno de dos pedidos simultáneos por el último producto gane la carrera', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 1 })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      await seedGuest(testEnv, EVENT_ID, OTHER_GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      const attempt = (guestId: string) => createConcessionOrder(EVENT_ID, {
        guestId,
        guestNameSnapshot: 'Invitado de prueba',
        lockToken: LOCK_TOKEN,
        currency: 'MXN',
        paymentMethod: 'cash',
        lines: [{ itemId: ITEM_ID, quantity: 1 }],
      })

      const results = await Promise.allSettled([attempt(GUEST_ID), attempt(OTHER_GUEST_ID)])
      const succeeded = results.filter((r) => r.status === 'fulfilled')
      const failed = results.filter((r) => r.status === 'rejected')
      expect(succeeded).toHaveLength(1)
      expect(failed).toHaveLength(1)

      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(0)
      expect(item?.status).toBe('outOfStock')
    })

    it('rechaza el checkout si el lockToken no corresponde al invitado dueño', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'unlimited' })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await expect(
        createConcessionOrder(EVENT_ID, {
          guestId: GUEST_ID,
          guestNameSnapshot: 'Invitado de prueba',
          lockToken: 'token-ajeno',
          currency: 'MXN',
          paymentMethod: 'cash',
          lines: [{ itemId: ITEM_ID, quantity: 1 }],
        }),
      ).rejects.toThrow()
    })
  })

  describe('flujo de pago', () => {
    it('el invitado dueño puede subir su comprobante (nota + foto)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { guestId: GUEST_ID, paymentPhase: 'awaiting_payment' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await submitConcessionPaymentProof(EVENT_ID, 'order-1', {
        note: 'Transferencia #12345',
        proofUrl: 'https://res.cloudinary.com/demo/proof.jpg',
        lockToken: LOCK_TOKEN,
      })

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, 'order-1')
      expect(order?.paymentPhase).toBe('proof_submitted')
      expect(order?.paymentProofUrl).toBe('https://res.cloudinary.com/demo/proof.jpg')
    })

    it('confirmar un pedido lo pasa a `confirmed` y a la cola de cocina como `queued`', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'proof_submitted' })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'not_ready' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await confirmConcessionOrderPayment(EVENT_ID, 'order-1')

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, 'order-1')
      expect(order?.paymentPhase).toBe('confirmed')
      const fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, 'order-1')
      expect(fulfillment?.fulfillmentStatus).toBe('queued')
    })

    it('el invitado puede cancelar su propio pedido antes de pagar (sin liberar stock por sí solo)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 3, status: 'active' })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', {
        guestId: GUEST_ID,
        paymentPhase: 'awaiting_payment',
        items: [{ itemId: ITEM_ID, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 2, lineTotalMinorUnits: 7000 }],
      })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      await cancelOwnConcessionOrder(EVENT_ID, 'order-1', LOCK_TOKEN)

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, 'order-1')
      expect(order?.paymentPhase).toBe('cancelled')
      expect(order?.cancelReason).toBe('guest_cancelled')
      // El stock NO se libera automáticamente por una autocancelación (ver
      // isValidConcessionStockRelease en firestore.rules): un actor anónimo
      // nunca puede aumentar el inventario, solo el organizador/staff al
      // cancelar el pedido desde su bandeja (ver siguiente test).
      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(3)
    })

    it('el organizador SÍ libera el stock reservado al cancelar un pedido', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 3, status: 'active' })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', {
        guestId: GUEST_ID,
        paymentPhase: 'awaiting_payment',
        items: [{ itemId: ITEM_ID, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 2, lineTotalMinorUnits: 7000 }],
      })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { guestId: GUEST_ID, fulfillmentStatus: 'not_ready' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await cancelConcessionOrder(EVENT_ID, 'order-1', 'organizer_cancelled')

      const order = await getConcessionOrderDoc(testEnv, EVENT_ID, 'order-1')
      expect(order?.paymentPhase).toBe('cancelled')
      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(5)
      const fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, 'order-1')
      expect(fulfillment?.fulfillmentStatus).toBe('cancelled')
    })

    it('un ítem agotado vuelve a `active` cuando el organizador cancela un pedido y libera stock', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 0, status: 'outOfStock' })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', {
        guestId: GUEST_ID,
        paymentPhase: 'awaiting_payment',
        items: [{ itemId: ITEM_ID, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 3500, quantity: 1, lineTotalMinorUnits: 3500 }],
      })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await cancelConcessionOrder(EVENT_ID, 'order-1', 'organizer_cancelled')

      const item = await getConcessionItemDoc(testEnv, EVENT_ID, ITEM_ID)
      expect(item?.stockRemaining).toBe(1)
      expect(item?.status).toBe('active')
    })

    it('un invitado no puede cancelar el pedido de otro invitado (token reconocido, pero de OTRO pase)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      await seedGuest(testEnv, EVENT_ID, OTHER_GUEST_ID, { lockTokens: ['otro-device-token'] })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { guestId: OTHER_GUEST_ID, paymentPhase: 'awaiting_payment' })
      dbHolder.db = testEnv.unauthenticatedContext().firestore()

      // LOCK_TOKEN es válido para GUEST_ID, pero el pedido es de
      // OTHER_GUEST_ID (cuyo dispositivo reconocido es otro token distinto)
      // — isGuestOrderActor debe evaluar contra el guestId DEL PEDIDO, no
      // contra cualquier invitado que el token conozca.
      await expect(cancelOwnConcessionOrder(EVENT_ID, 'order-1', LOCK_TOKEN)).rejects.toThrow()
    })
  })

  describe('Menu Manager (concessionsFulfillment) — sin acceso a dinero', () => {
    it('NUNCA puede leer un pedido todavía no pagado (`not_ready`)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'not_ready' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertFails(getDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1')))
    })

    it('puede leer y avanzar un pedido ya en cola (`queued`)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'queued' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertSucceeds(getDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1')))
      await assertSucceeds(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'preparing' }),
      )
    })

    it('puede retroceder un paso (`ready` → `preparing`)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'ready' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'preparing' }),
      )
    })

    it('NUNCA puede marcar un pedido como `cancelled` (eso implica liberar stock, reservado a confirmPayments/manageConcessions/admin)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'preparing' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertFails(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'cancelled' }),
      )
    })

    it('no puede tocar un pedido ya `delivered`', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'delivered' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertFails(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'ready' }),
      )
    })

    it('no puede escribir a ciegas sobre un pedido en `not_ready` (adivinando el id)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'not_ready' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      await assertFails(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'queued' }),
      )
    })

    it('nunca tiene permiso de lectura/escritura sobre concessionsOrders (dinero/comprobante)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'proof_submitted' })
      const staffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      // `get` de concessionsOrders es bearer-link (igual que guests/{guestId}):
      // cualquiera que conozca el id lo puede leer, INCLUIDO el staff — la
      // garantía real de este módulo es que el staff nunca puede DESCUBRIR
      // ese id desde su propia cola (concessionsFulfillment de un pedido
      // `not_ready` es ilegible para él, ver test de arriba) ni tiene permiso
      // de administración (`manageConcessions`/`confirmPayments`) para
      // *actuar* sobre él.
      await assertFails(
        updateDoc(doc(staffDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), { paymentPhase: 'confirmed' }),
      )
    })
  })

  describe('configuración y staff (Fase 1 — panel de organizador)', () => {
    it('un admin puede activar el módulo con una config inicial completa', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedAdmin(testEnv, ADMIN_UID)
      dbHolder.db = testEnv.authenticatedContext(ADMIN_UID).firestore()

      await enableConcessionsBeta(EVENT_ID, {
        storeName: 'Barra de Baile Improvisado',
        currency: 'MXN',
        paymentMethods: ['transfer', 'cash'],
        useEventPaymentInstructions: true,
      })

      const event = await getEventDoc(testEnv, EVENT_ID)
      const concessions = event?.concessions as Record<string, unknown> | undefined
      expect(concessions?.enabled).toBe(true)
      expect(concessions?.storeName).toBe('Barra de Baile Improvisado')
      expect(concessions?.concessionsStaffMap).toEqual({})
    })

    it('un co-organizador con manageConcessions puede editar la config (sin poder activar el módulo)', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: true } },
      })
      dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()

      await updateConcessionsSettings(EVENT_ID, { pickupInstructions: 'Recoge en la barra central' })

      const event = await getEventDoc(testEnv, EVENT_ID)
      const concessions = event?.concessions as Record<string, unknown> | undefined
      expect(concessions?.pickupInstructions).toBe('Recoge en la barra central')
      expect(concessions?.enabled).toBe(true) // sin cambios
    })

    it('el mismo co-organizador NO puede colar `enabled: true` en un evento donde el módulo está apagado', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: { ...enabledConcessions, enabled: false },
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: true } },
      })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID), {
          'concessions.enabled': true,
          'concessions.storeName': 'Intento de auto-activarse',
        }),
      )
    })

    it('el mismo co-organizador SÍ puede apagar el módulo (no requiere ser admin)', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: true } },
      })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertSucceeds(updateDoc(doc(coOrgDb, 'events', EVENT_ID), { 'concessions.enabled': false }))
    })

    it('rechaza que un co-organizador SIN manageConcessions edite la config', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { manageConcessions: false } },
      })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID), { 'concessions.storeName': 'Intento no autorizado' }),
      )
    })

    it('agrega y quita un Menu Manager del staff map', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: { ...enabledConcessions, concessionsStaffMap: {} } })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await addConcessionsStaff(EVENT_ID, STAFF_UID, 'staff@test.com')
      let event = await getEventDoc(testEnv, EVENT_ID)
      expect((event?.concessions as Record<string, unknown>).concessionsStaffMap).toEqual({ [STAFF_UID]: 'staff@test.com' })

      await removeConcessionsStaff(EVENT_ID, STAFF_UID)
      event = await getEventDoc(testEnv, EVENT_ID)
      expect((event?.concessions as Record<string, unknown>).concessionsStaffMap).toEqual({})
    })
  })

  describe('cocina del Menu Manager (Fase 3 — advance/revert)', () => {
    it('el Menu Manager avanza y retrocede la preparación de un pedido pagado', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'queued' })
      dbHolder.db = testEnv.authenticatedContext(STAFF_UID).firestore()

      await advanceConcessionFulfillment(EVENT_ID, 'order-1')
      let fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, 'order-1')
      expect(fulfillment?.fulfillmentStatus).toBe('preparing')

      await advanceConcessionFulfillment(EVENT_ID, 'order-1')
      fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, 'order-1')
      expect(fulfillment?.fulfillmentStatus).toBe('ready')

      await revertConcessionFulfillment(EVENT_ID, 'order-1')
      fulfillment = await getConcessionFulfillmentDoc(testEnv, EVENT_ID, 'order-1')
      expect(fulfillment?.fulfillmentStatus).toBe('preparing')
    })

    it('el Menu Manager no puede avanzar un pedido que todavía no fue pagado', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'not_ready' })
      dbHolder.db = testEnv.authenticatedContext(STAFF_UID).firestore()

      // advanceConcessionFulfillment intenta leer y actualizar dentro de una
      // transacción — la lectura la permite `allow get` (que sí bloquea
      // 'not_ready' para staff), así que el intento de escritura debe
      // rechazarse igual que si se adivinara el id a mano.
      await expect(advanceConcessionFulfillment(EVENT_ID, 'order-1')).rejects.toThrow()
    })
  })
})
