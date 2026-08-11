import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { createTestEnv, getGuestDoc, seedEvent, seedGuest } from './helpers'

const EVENT_ID = 'event-1'
const GUEST_ID = 'guest-1'
const OWNER_UID = 'owner-uid'

// El check-in parcial (familias/acompañantes, ver functions/src/checkin/
// shared.ts:planCheckIn) agrega `presentIndices` a guests/{guestId} — mismo
// nivel de protección que status/checkedInAt/checkedOutAt: solo lo escriben
// las Cloud Functions (Admin SDK, ignoran estas reglas). Estos tests cubren
// que ningún camino de escritura del cliente (organizador con editGuests,
// admin, autoedición del invitado) puede tocarlo, ni siquiera "de rebote"
// junto con una edición legítima — y que esas ediciones legítimas siguen
// funcionando sin este campo de por medio.
describe('presentIndices protegido en guests/{guestId} (check-in parcial)', () => {
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

  it('rejects an organizer trying to set presentIndices directly, even bundled with a legitimate edit', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [{ name: 'Maria' }, { name: 'Pedro' }] })
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertFails(
      updateDoc(doc(ownerDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        name: 'Nombre editado',
        presentIndices: [0, 1, 2],
      }),
    )
    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.name).toBe('Invitado de prueba')
  })

  it('still allows a normal organizer edit that does not touch presentIndices', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [] })
    const ownerDb = testEnv.authenticatedContext(OWNER_UID).firestore()

    await assertSucceeds(
      updateDoc(doc(ownerDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        name: 'Nombre editado',
        version: 1,
        updatedAt: serverTimestamp(),
      }),
    )
    const guest = await getGuestDoc(testEnv, EVENT_ID, GUEST_ID)
    expect(guest?.name).toBe('Nombre editado')
  })

  it('rejects a self-edit (bearer link) that tries to smuggle presentIndices in', async () => {
    await seedEvent(testEnv, EVENT_ID, { ownerId: OWNER_UID })
    await seedGuest(testEnv, EVENT_ID, GUEST_ID, { companions: [], lockTokens: ['device-1'] })
    const guestDb = testEnv.unauthenticatedContext().firestore()

    await assertFails(
      updateDoc(doc(guestDb, 'events', EVENT_ID, 'guests', GUEST_ID), {
        name: 'Invitado de prueba',
        companions: [],
        lockToken: 'device-1',
        presentIndices: [0],
      }),
    )
  })
})
