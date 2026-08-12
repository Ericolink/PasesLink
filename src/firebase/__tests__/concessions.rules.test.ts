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
  advanceConcessionFulfillment,
  cancelOwnConcessionOrder,
  confirmConcessionOrderPayment,
  createConcessionItem,
  enableConcessionsBeta,
  removeConcessionsStaff,
  revertConcessionFulfillment,
  updateConcessionItem,
  updateConcessionsSettings,
} from '../concessions'

const EVENT_ID = 'event-1'
const OWNER_UID = 'owner-uid'
const ADMIN_UID = 'admin-uid'
const COORG_UID = 'coorg-uid'
// Encargado legado (alta por email, previa a la invitación por enlace) — un
// simple string en el mapa, sin `roles`. Se resuelve como solo-preparación
// (resolveConcessionsStaffEntry), el único acceso que este actor ya tenía en
// la práctica antes de existir el rol de caja.
const STAFF_UID = 'staff-uid'
// Encargados del rol nuevo (shape { email, roles }), dados de alta vía
// createConcessionsStaffInvite/acceptConcessionsStaffInvite (Cloud
// Functions, no cubiertas por este archivo — ver
// functions/src/callable/*ConcessionsStaffInvite.ts).
const CASHIER_UID = 'cashier-uid'
const PREP_UID = 'prep-uid'
const BOTH_ROLES_UID = 'both-roles-uid'
const GUEST_ID = 'guest-1'
const OTHER_GUEST_ID = 'guest-2'
const ITEM_ID = 'item-soda'
const LOCK_TOKEN = 'device-token-1'

const enabledConcessions = {
  enabled: true,
  currency: 'MXN',
  paymentMethods: ['transfer', 'cash'],
  useEventPaymentInstructions: true,
  concessionsStaffMap: {
    [STAFF_UID]: 'staff@test.com',
    [CASHIER_UID]: { email: 'cashier@test.com', roles: { cashier: true, prep: false } },
    [PREP_UID]: { email: 'prep@test.com', roles: { cashier: false, prep: true } },
    [BOTH_ROLES_UID]: { email: 'both@test.com', roles: { cashier: true, prep: true } },
  },
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

    // Regresión real: ConcessionItemFormModal manda `description`/`imageUrl`
    // en `undefined` cuando el organizador deja esos campos vacíos al editar
    // un producto. updateConcessionItem hacía `transaction.update(ref, {
    // ...input, ... })` sin limpiar esos `undefined` — Firestore rechazaba la
    // escritura entera ("Unsupported field value: undefined").
    it('permite editar un producto limpiando su descripción/foto a vacío', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { description: 'Sabor original', imageUrl: 'https://res.cloudinary.com/demo/old.jpg' })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await expect(updateConcessionItem(EVENT_ID, ITEM_ID, {
        name: 'Soda italiana',
        description: undefined,
        imageUrl: undefined,
        stockInitial: undefined,
      })).resolves.not.toThrow()
    })
  })

  // createConcessionOrder se migró a Cloud Functions (ver
  // FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase B) — cierra el gap real que
  // documentaba el comentario de isValidConcessionOrderCreate en
  // firestore.rules (no había forma de verificar que subtotalMinorUnits/
  // totalMinorUnits coincidieran con el catálogo real). Los 5 tests que
  // probaban esta función (reserva de stock, pedido gratis, stock
  // insuficiente, carrera por el último producto, lockToken ajeno) viven
  // ahora en functions/src/concessions/createConcessionOrder.test.ts,
  // probados contra el emulador vía Admin SDK.

  // Ahora que Fase B angostó las rules (2026-08-02), estos 3 tests prueban lo
  // contrario de lo que probaban las versiones viejas de
  // isValidConcessionOrderCreate/isValidConcessionStockDecrement/
  // isValidConcessionStockRelease: que ya NO existe ninguna rama que autorice
  // a un cliente a fabricar estos documentos directo contra Firestore, ni
  // siquiera con un payload perfectamente formado y un lockToken legítimo —
  // la única vía posible es la Callable (Admin SDK, bypassea estas reglas).
  describe('escritura directa de cliente sobre dinero/stock — debe estar cerrada', () => {
    it('rechaza crear un pedido directo en concessionsOrders, aunque el payload sea válido y el lockToken sea del propio invitado', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsOrders', 'order-fabricado'), {
          guestId: GUEST_ID,
          guestNameSnapshot: 'Invitado de prueba',
          items: [{ itemId: ITEM_ID, nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', unitPriceMinorUnitsSnapshot: 1, quantity: 1, lineTotalMinorUnits: 1 }],
          subtotalMinorUnits: 1,
          totalMinorUnits: 1,
          currency: 'MXN',
          itemCount: 1,
          paymentMethod: 'cash',
          paymentPhase: 'awaiting_payment',
          lockToken: LOCK_TOKEN,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      )
    })

    it('rechaza que un invitado descuente stock/suba soldCount directo en concessionsCatalog', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 10, soldCount: 0, status: 'active' })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), {
          stockRemaining: 9,
          soldCount: 1,
          updatedAt: Date.now(),
        }),
      )
    })

    // Antes, un coanfitrión con `confirmPayments` (pero SIN `manageConcessions`)
    // podía "liberar" stock con un update angosto vía isValidConcessionStockRelease
    // — era su única vía para que cancelConcessionOrder (organizador) funcionara
    // del lado cliente. Ahora esa cancelación corre en la Cloud Function (que
    // revisa el mismo permiso del lado servidor, ver canConfirmPayments en
    // functions/src/lib/permissions.ts), así que este actor ya no necesita
    // ni debe tener una vía directa contra concessionsCatalog.
    it('un coanfitrión con confirmPayments (sin manageConcessions) ya no puede tocar stockRemaining directo en concessionsCatalog', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: enabledConcessions,
        coOrganizersMap: { [COORG_UID]: 'coorg@test.com' },
        coOrganizerPermissions: { [COORG_UID]: { confirmPayments: true, manageConcessions: false } },
      })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { stockMode: 'limited', stockRemaining: 5, status: 'outOfStock' })
      const coOrgDb = testEnv.authenticatedContext(COORG_UID).firestore()

      await assertFails(
        updateDoc(doc(coOrgDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), {
          stockRemaining: 6,
          status: 'active',
          updatedAt: Date.now(),
        }),
      )
    })

    it('rechaza crear la proyección de cocina directo en concessionsFulfillment', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        setDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-fabricado'), {
          guestId: GUEST_ID,
          guestNameSnapshot: 'Invitado de prueba',
          orderNumber: 'FAKE01',
          lines: [{ nameSnapshot: 'Soda italiana', categorySnapshot: 'drink', quantity: 1 }],
          fulfillmentStatus: 'not_ready',
          lockToken: LOCK_TOKEN,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        }),
      )
    })
  })

  describe('flujo de pago', () => {
    // Rediseño "Ventas del evento" (2026-08-12) §14-16: el invitado ya NO
    // sube comprobante/referencia — tanto efectivo como transferencia se
    // validan en persona en caja. submitConcessionPaymentProof se eliminó
    // del cliente y la rama de rules que autorizaba esta transición
    // (`paymentPhase: 'proof_submitted'`) se cerró — este test prueba que
    // ya no hay ninguna vía legítima de escribir eso, ni siquiera con un
    // payload perfectamente formado y lockToken válido.
    it('el invitado dueño YA NO puede subir comprobante/referencia (removido del rediseño de pagos)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedGuest(testEnv, EVENT_ID, GUEST_ID, { lockTokens: [LOCK_TOKEN] })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { guestId: GUEST_ID, paymentPhase: 'awaiting_payment' })
      const anonDb = testEnv.unauthenticatedContext().firestore()

      await assertFails(
        updateDoc(doc(anonDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), {
          paymentPhase: 'proof_submitted',
          paymentNote: 'Transferencia #12345',
          paymentProofUrl: 'https://res.cloudinary.com/demo/proof.jpg',
          lockToken: LOCK_TOKEN,
          updatedAt: Date.now(),
        }),
      )
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

    // cancelConcessionOrder (organizador, libera stock reservado) se migró a
    // Cloud Functions (ver FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase B) —
    // los 2 tests que probaban esto (libera stock al cancelar; un ítem
    // agotado vuelve a `active`) viven ahora en
    // functions/src/concessions/cancelConcessionOrder.test.ts.

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

  // Rediseño "Ventas del evento" (2026-08-12): separa el rol único "Menu
  // Manager" en dos roles independientes (caja/preparación), cada uno sin
  // ser coorganizador. isConcessionsCashier/isConcessionsPrep leen el mismo
  // mapa que antes (`concessionsStaffMap`), ahora con shape
  // `{ email, roles }` — ver resolveConcessionsStaffEntry.
  describe('encargados de caja/preparación (roles nuevos, sin ser coorganizador)', () => {
    it('un encargado de CAJA puede confirmar un pago en concessionsOrders', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'awaiting_payment' })
      const cashierDb = testEnv.authenticatedContext(CASHIER_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(cashierDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), { paymentPhase: 'confirmed', paidAt: Date.now() }),
      )
    })

    it('un encargado de CAJA (sin rol de preparación) no tiene ningún acceso a concessionsFulfillment', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'queued' })
      const cashierDb = testEnv.authenticatedContext(CASHIER_UID).firestore()

      // A diferencia de un invitado cualquiera (bearer-link libre), un
      // encargado de caja SÍ está en concessionsStaffMap — así que cae en
      // la rama "es staff pero sin el rol correcto", no en el bypass de
      // bearer-link (`!isConcessionsStaffMember`).
      await assertFails(getDoc(doc(cashierDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1')))
      await assertFails(
        updateDoc(doc(cashierDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'preparing' }),
      )
    })

    it('un encargado de PREPARACIÓN no puede confirmar pagos en concessionsOrders', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'awaiting_payment' })
      const prepDb = testEnv.authenticatedContext(PREP_UID).firestore()

      await assertFails(
        updateDoc(doc(prepDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), { paymentPhase: 'confirmed' }),
      )
    })

    it('un encargado de PREPARACIÓN sí puede avanzar concessionsFulfillment y marcar agotado en el catálogo', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'queued' })
      await seedConcessionItem(testEnv, EVENT_ID, ITEM_ID, { status: 'active' })
      const prepDb = testEnv.authenticatedContext(PREP_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(prepDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'preparing' }),
      )
      await assertSucceeds(
        updateDoc(doc(prepDb, 'events', EVENT_ID, 'concessionsCatalog', ITEM_ID), { status: 'outOfStock' }),
      )
    })

    it('un encargado legado (shape string, alta previa a la invitación) sigue resolviéndose como solo-preparación', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'awaiting_payment' })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-2', { fulfillmentStatus: 'queued' })
      const legacyStaffDb = testEnv.authenticatedContext(STAFF_UID).firestore()

      // Puede preparación (comportamiento histórico sin cambios)...
      await assertSucceeds(
        updateDoc(doc(legacyStaffDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-2'), { fulfillmentStatus: 'preparing' }),
      )
      // ...pero NUNCA caja, aunque el shape legado no distinga roles: sin
      // `roles.cashier` explícito no hay forma de otorgarle ese permiso.
      await assertFails(
        updateDoc(doc(legacyStaffDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), { paymentPhase: 'confirmed' }),
      )
    })

    it('un encargado con AMBOS roles puede confirmar pagos y avanzar preparación', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      await seedConcessionOrder(testEnv, EVENT_ID, 'order-1', { paymentPhase: 'awaiting_payment' })
      await seedConcessionFulfillment(testEnv, EVENT_ID, 'order-1', { fulfillmentStatus: 'queued' })
      const bothDb = testEnv.authenticatedContext(BOTH_ROLES_UID).firestore()

      await assertSucceeds(
        updateDoc(doc(bothDb, 'events', EVENT_ID, 'concessionsOrders', 'order-1'), { paymentPhase: 'confirmed', paidAt: Date.now() }),
      )
      await assertSucceeds(
        updateDoc(doc(bothDb, 'events', EVENT_ID, 'concessionsFulfillment', 'order-1'), { fulfillmentStatus: 'preparing' }),
      )
    })

    it('las invitaciones de encargado (concessionsStaffInvites) son ilegibles desde el cliente', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

      await assertFails(getDoc(doc(ownerDb, 'events', EVENT_ID, 'concessionsStaffInvites', 'some-token')))
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

    // Regresión real: el formulario (ConcessionSettingsPanel) manda
    // `storeName: undefined` cuando el organizador deja ese campo vacío
    // (patrón `.trim() || undefined`). Firestore rechaza cualquier campo con
    // valor `undefined` explícito ("Unsupported field value: undefined") —
    // sin `omitUndefined` en enableConcessionsBeta/updateConcessionsSettings,
    // esto rompía la activación del módulo entero de forma silenciosa (el
    // catch de la UI solo mostraba un mensaje en pantalla, sin loguear el
    // error real en consola).
    it('activa el módulo aunque el organizador deje el nombre de la tienda vacío (storeName undefined)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
      await seedAdmin(testEnv, ADMIN_UID)
      dbHolder.db = testEnv.authenticatedContext(ADMIN_UID).firestore()

      await expect(enableConcessionsBeta(EVENT_ID, {
        storeName: undefined,
        currency: 'MXN',
        paymentMethods: ['transfer'],
        useEventPaymentInstructions: true,
      })).resolves.not.toThrow()

      const event = await getEventDoc(testEnv, EVENT_ID)
      const concessions = event?.concessions as Record<string, unknown> | undefined
      expect(concessions?.enabled).toBe(true)
      expect(concessions).not.toHaveProperty('storeName')
    })

    // Bug real encontrado en vivo (2026-07-31): un evento de prueba sin
    // moneda configurada (EventData.currency === '') dejaba
    // `concessions.currency: ''` guardado al activar el módulo — y
    // firestore.rules exige `currency.size() > 0` en cada producto del
    // catálogo (isValidConcessionItem), así que CUALQUIER alta de producto
    // se rechazaba después con "Missing or insufficient permissions", sin
    // ninguna pista de que la causa era la moneda vacía. enableConcessionsBeta/
    // updateConcessionsSettings ahora nunca persisten `currency` vacío.
    it('nunca guarda `currency` vacío al activar el módulo, aunque el evento no tenga moneda configurada', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, currency: '' })
      await seedAdmin(testEnv, ADMIN_UID)
      dbHolder.db = testEnv.authenticatedContext(ADMIN_UID).firestore()

      await enableConcessionsBeta(EVENT_ID, {
        storeName: 'Test',
        currency: '',
        paymentMethods: ['transfer'],
        useEventPaymentInstructions: true,
      })

      const event = await getEventDoc(testEnv, EVENT_ID)
      const concessions = event?.concessions as Record<string, unknown> | undefined
      expect(concessions?.currency).toBe('$')

      // Y con esa moneda de respaldo, dar de alta un producto ya no se
      // rechaza — la validación real (isValidConcessionItem) pasa.
      await expect(createConcessionItem(EVENT_ID, {
        name: 'Soda italiana',
        category: 'drink',
        priceMinorUnits: 3500,
        currency: concessions?.currency as string,
        stockMode: 'unlimited',
        sortOrder: 0,
      })).resolves.not.toThrow()
    })

    it('nunca guarda `currency` vacío al editar la configuración', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await updateConcessionsSettings(EVENT_ID, { currency: '' })

      const event = await getEventDoc(testEnv, EVENT_ID)
      const concessions = event?.concessions as Record<string, unknown> | undefined
      expect(concessions?.currency).toBe('$')
    })

    it('guarda la configuración aunque se limpien campos opcionales a vacío (paymentInstructions/pickupInstructions undefined)', async () => {
      await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID, concessions: enabledConcessions })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await expect(updateConcessionsSettings(EVENT_ID, {
        storeName: undefined,
        pickupInstructions: undefined,
      })).resolves.not.toThrow()
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

    // El alta ahora es siempre por invitación con enlace (Cloud Functions
    // createConcessionsStaffInvite/acceptConcessionsStaffInvite, no
    // cubiertas por este archivo de rules) — el único cliente que sigue
    // escribiendo directo sobre concessionsStaffMap es removeConcessionsStaff.
    it('quita un encargado del staff map (borra la entrada completa, ambos roles)', async () => {
      await seedEvent(testEnv, EVENT_ID, {
        ownerId: OWNER_UID,
        concessions: { ...enabledConcessions, concessionsStaffMap: { [BOTH_ROLES_UID]: { email: 'both@test.com', roles: { cashier: true, prep: true } } } },
      })
      dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

      await removeConcessionsStaff(EVENT_ID, BOTH_ROLES_UID)
      const event = await getEventDoc(testEnv, EVENT_ID)
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
