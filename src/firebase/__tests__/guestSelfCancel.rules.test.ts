import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { deleteDoc, doc, updateDoc } from 'firebase/firestore'
import {
  createTestEnv,
  getEventDoc,
  getGuestContactDoc,
  getGuestDoc,
  seedEvent,
  seedGuest,
  seedGuestContact,
  type EmulatorFirestore,
} from './helpers'

// Mismo mock que guests.test.ts/guestOwnership.rules.test.ts: redirige el `db`
// singleton de guests.ts al Firestore del emulador activo en cada test.
const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

import { deleteGuest } from '../guests'

const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'

// Cubre "Cancelar mi asistencia" (GuestPass.tsx): un invitado ya confirmado
// (rsvpStatus 'yes', incluye autoregistro) se borra a sí mismo llamando al
// mismo deleteGuest() que ya usa el organizador — acá se prueba que las
// reglas nuevas (guests/guestContacts `allow delete` self-service +
// guestSelfCancelCountsOk en events/{eventId}) lo permiten sin cuenta ni
// permiso de coanfitrión, y que las mismas reglas cierran la puerta a un
// cliente que intente saltarse la validación (tocar presencia, borrar en
// lote, seguir cancelando después de haber hecho check-in).
describe('autocancelación del invitado (guests/{guestId} self-delete)', () => {
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

  it('lets an unauthenticated guest (no account) cancel their own confirmed attendance', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1, rsvpYesCount: 1 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { rsvpStatus: 'yes', companions: [] })
    await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'invited',
      companions: [],
      checkedOutAt: null,
      exitType: null,
      paymentStatus: 'unpaid',
      rsvpStatus: 'yes',
    })

    expect(await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)).toBeUndefined()
    expect(await getGuestContactDoc(testEnv, EVENT_ID, GUEST_ID)).toBeUndefined()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.rsvpYesCount).toBe(0)
  })

  it('decrements peopleCount and paidCount by the full party size for a paid guest with companions', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 3, paidCount: 3, rsvpYesCount: 1 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { rsvpStatus: 'yes', companions: [{}, {}], paymentStatus: 'paid' })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await deleteGuest(EVENT_ID, {
      id: GUEST_ID,
      status: 'invited',
      companions: [{}, {}],
      checkedOutAt: null,
      exitType: null,
      paymentStatus: 'paid',
      rsvpStatus: 'yes',
    })

    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(0)
    expect(event?.peopleCount).toBe(0)
    expect(event?.paidCount).toBe(0)
  })

  it('rejects self-cancellation once the guest has already checked in', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1, checkedInCount: 1, occupancyCount: 1, rsvpYesCount: 1 })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { rsvpStatus: 'yes', companions: [], status: 'checked_in' })
    dbHolder.db = testEnv.unauthenticatedContext().firestore()

    await expect(
      deleteGuest(EVENT_ID, {
        id: GUEST_ID,
        status: 'checked_in',
        companions: [],
        checkedOutAt: null,
        exitType: null,
        paymentStatus: 'unpaid',
        rsvpStatus: 'yes',
      }),
    ).rejects.toThrow()

    expect(await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)).not.toBeUndefined()
    const event = await getEventDoc(testEnv, EVENT_ID)
    expect(event?.guestCount).toBe(1)
  })

  it('rejects guestContacts self-delete once the sibling guest has checked in', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { status: 'checked_in' })
    await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
    const callerDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(deleteDoc(doc(callerDb, 'events', EVENT_ID, 'guestContacts', GUEST_ID)))
  })

  it('allows guestContacts self-delete for a guest who has not checked in', async () => {
    await seedEvent(testEnv, EVENT_ID)
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { status: 'invited' })
    await seedGuestContact(testEnv, EVENT_ID, GUEST_ID, { email: 'ana@example.com' })
    const callerDb = testEnv.unauthenticatedContext().firestore()

    await assertSucceeds(deleteDoc(doc(callerDb, 'events', EVENT_ID, 'guestContacts', GUEST_ID)))
  })

  it('rejects a self-cancel counter update that also tampers with checkedInCount/occupancyCount', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1, checkedInCount: 1, occupancyCount: 1 })
    const callerDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(
      updateDoc(doc(callerDb, 'events', EVENT_ID), {
        guestCount: 0,
        peopleCount: 0,
        checkedInCount: 0,
        occupancyCount: 0,
      }),
    )
  })

  it('rejects a self-cancel counter update that removes more than one guest at a time', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 2, peopleCount: 2 })
    const callerDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(
      updateDoc(doc(callerDb, 'events', EVENT_ID), {
        guestCount: 0,
        peopleCount: 0,
      }),
    )
  })

  it('rejects a self-cancel counter update where paidCount drops by more than the party size', async () => {
    await seedEvent(testEnv, EVENT_ID, { guestCount: 1, peopleCount: 1, paidCount: 5 })
    const callerDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(
      updateDoc(doc(callerDb, 'events', EVENT_ID), {
        guestCount: 0,
        peopleCount: 0,
        paidCount: 0,
      }),
    )
  })
})
