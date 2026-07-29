import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc } from 'firebase/firestore'
import { createTestEnv, seedEvent, seedGuest, type EmulatorFirestore } from './helpers'

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { assignGuestToTable, createTable, deleteTable, updateTable } from '../seating'

const OWNER_UID = 'owner-uid'
const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'

const FULL_PERMS = {
  addGuests: true, editGuests: true, deleteGuests: true, shareInviteLink: true,
  confirmPayments: true, scanQr: true, viewGuestList: true, postWall: true,
  moderateWall: true, editEvent: true, manageCoOrganizers: true, viewReports: true,
  exportLists: true, downloadEventInfo: true,
}

describe('seating.ts', () => {
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

  it('should let the owner create, update and delete a table', async () => {
    await seedEvent(testEnv, EVENT_ID)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()

    const tableId = await createTable(EVENT_ID, { name: 'Mesa 1', capacity: 8, shape: 'round', sortOrder: 0 })
    let snap = await getDoc(doc(dbHolder.db, 'events', EVENT_ID, 'tables', tableId))
    expect(snap.data()?.name).toBe('Mesa 1')
    expect(snap.data()?.capacity).toBe(8)

    await updateTable(EVENT_ID, tableId, { name: 'Mesa 1 (renombrada)' })
    snap = await getDoc(doc(dbHolder.db, 'events', EVENT_ID, 'tables', tableId))
    expect(snap.data()?.name).toBe('Mesa 1 (renombrada)')

    await deleteTable(EVENT_ID, tableId)
    snap = await getDoc(doc(dbHolder.db, 'events', EVENT_ID, 'tables', tableId))
    expect(snap.exists()).toBe(false)
  })

  it('should let a co-organizer with ONLY manageSeating (no editGuests) move a guest to a table', async () => {
    const COORG_UID = 'coorg-seating-uid'
    await seedEvent(testEnv, EVENT_ID, {
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: { ...FULL_PERMS, editGuests: false, manageSeating: true, viewLiveDashboard: false },
      },
    })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const tableId = await createTable(EVENT_ID, { name: 'Mesa VIP', capacity: 4, shape: 'round', sortOrder: 0 })

    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()
    await assignGuestToTable(EVENT_ID, GUEST_ID, tableId)

    const guestSnap = await getDoc(doc(dbHolder.db, 'events', EVENT_ID, 'guests', GUEST_ID))
    expect(guestSnap.data()?.tableId).toBe(tableId)
  })

  it('should reject assigning a table for a co-organizer without manageSeating', async () => {
    const COORG_UID = 'coorg-nomanage-uid'
    await seedEvent(testEnv, EVENT_ID, {
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: {
        [COORG_UID]: { ...FULL_PERMS, editGuests: false, manageSeating: false, viewLiveDashboard: false },
      },
    })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID)
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const tableId = await createTable(EVENT_ID, { name: 'Mesa 1', capacity: 4, shape: 'round', sortOrder: 0 })

    dbHolder.db = testEnv.authenticatedContext(COORG_UID).firestore()
    await assertFails(assignGuestToTable(EVENT_ID, GUEST_ID, tableId))
  })

  // El pedido es DETECTAR sobrecupo, no impedirlo — la regla no debe rechazar
  // una asignación que supere la capacidad de la mesa.
  it('should allow assigning a guest past a table capacity (over-capacity is a UI warning, not a rule)', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [{ name: 'Uno' }, { name: 'Dos' }] })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const tableId = await createTable(EVENT_ID, { name: 'Mesa chica', capacity: 1, shape: 'round', sortOrder: 0 })

    await expect(assignGuestToTable(EVENT_ID, GUEST_ID, tableId)).resolves.not.toThrow()
    const guestSnap = await getDoc(doc(dbHolder.db, 'events', EVENT_ID, 'guests', GUEST_ID))
    expect(guestSnap.data()?.tableId).toBe(tableId)
  })
})
