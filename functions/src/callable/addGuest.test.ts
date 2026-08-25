import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestContactsDoc, getGuestDoc, getTestFirestore, seedEvent, uniqueId } from '../__tests__/helpers.js'
import { fakeCallableRequest } from '../__tests__/callable.js'
import { GUEST_GROUP_MAX_MEMBERS, GUEST_MAX_COMPANIONS } from '../lib/guestValidation.js'
import { addGuest } from './addGuest.js'

const OWNER_UID = 'owner-uid'

describe('addGuest', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates the guest and updates guestCount/peopleCount/rsvpPendingCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0, peopleCount: 0 })

    const result = await addGuest.run(fakeCallableRequest({
      eventId,
      name: 'Eric',
      lastName: 'Muñoz',
      groupLabel: 'Familia Muñoz',
      companions: [
        { name: 'Ana', lastName: 'Muñoz' },
        { name: 'Carlos', lastName: 'Muñoz' },
        { name: 'María', lastName: 'García' },
      ],
      isGroup: true,
    }, OWNER_UID))

    expect(result).toEqual({ status: 'success', id: expect.any(String) })
    if (result.status !== 'success') throw new Error('unreachable')
    const guestDoc = await getGuestDoc(db, eventId, result.id)
    expect(guestDoc?.companions).toHaveLength(3)
    expect(guestDoc?.groupLabel).toBe('Familia Muñoz')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(1)
    expect(event.data()?.peopleCount).toBe(4)
    expect(event.data()?.rsvpPendingCount).toBe(1)
  })

  // No usa el apellido como criterio de pertenencia familiar (regla
  // explícita del rediseño): distintos apellidos entre integrantes de la
  // misma familia/grupo deben funcionar exactamente igual.
  it('allows a group whose members have different last names', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0, peopleCount: 0 })

    const result = await addGuest.run(fakeCallableRequest({
      eventId,
      name: 'Eric',
      lastName: 'Muñoz',
      companions: [{ name: 'Ana', lastName: 'García' }, { name: 'Carlos', lastName: 'Hernández' }],
      isGroup: true,
    }, OWNER_UID))

    expect(result.status).toBe('success')
  })

  it('omits groupLabel entirely when the organizer leaves it blank (legacy shape, no misleading empty string)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await addGuest.run(fakeCallableRequest({
      eventId, name: 'Eric', lastName: 'Muñoz', companions: [{ name: 'Ana', lastName: 'Muñoz' }], isGroup: true,
    }, OWNER_UID))
    if (result.status !== 'success') throw new Error('unreachable')

    const guestDoc = await getGuestDoc(db, eventId, result.id)
    expect(guestDoc?.groupLabel).toBeUndefined()
  })

  it('rejects a group without a last name for the first member', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(addGuest.run(fakeCallableRequest({
      eventId, name: 'Eric', companions: [{ name: 'Ana', lastName: 'Muñoz' }], isGroup: true,
    }, OWNER_UID))).rejects.toThrow(HttpsError)
  })

  it('rejects a group member (companion) without a name or last name', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(addGuest.run(fakeCallableRequest({
      eventId, name: 'Eric', lastName: 'Muñoz', companions: [{}], isGroup: true,
    }, OWNER_UID))).rejects.toThrow(HttpsError)
  })

  // Bug real corregido junto con este rediseño: el formulario de "Familia o
  // grupo" siempre prometió hasta GUEST_GROUP_MAX_MEMBERS (50) integrantes,
  // pero el servidor validaba contra GUEST_MAX_COMPANIONS (20) por error —
  // un grupo de más de 21 integrantes se rechazaba en silencio pese a que el
  // cliente lo dejaba enviar.
  it('allows a group larger than GUEST_MAX_COMPANIONS (fixed cap mismatch), up to GUEST_GROUP_MAX_MEMBERS', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 100, guestCount: 0, peopleCount: 0 })

    const result = await addGuest.run(fakeCallableRequest({
      eventId,
      name: 'Eric',
      lastName: 'Muñoz',
      isGroup: true,
      companions: Array.from({ length: GUEST_MAX_COMPANIONS + 5 }, (_, i) => ({ name: `Integrante${i}`, lastName: 'Muñoz' })),
    }, OWNER_UID))

    expect(result.status).toBe('success')
  })

  it('still rejects a group beyond GUEST_GROUP_MAX_MEMBERS', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(addGuest.run(fakeCallableRequest({
      eventId,
      name: 'Eric',
      lastName: 'Muñoz',
      isGroup: true,
      companions: Array.from({ length: GUEST_GROUP_MAX_MEMBERS }, (_, i) => ({ name: `Integrante${i}`, lastName: 'Muñoz' })),
    }, OWNER_UID))).rejects.toThrow(HttpsError)
  })

  it('writes the phone into guestContacts, never onto the public guest doc', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await addGuest.run(fakeCallableRequest({
      eventId, name: 'Juan', lastName: 'Pérez', phone: '11-2222-3333',
    }, OWNER_UID))
    if (result.status !== 'success') throw new Error('unreachable')

    const guestDoc = await getGuestDoc(db, eventId, result.id)
    expect(guestDoc?.phone).toBeUndefined()
    const contact = await getGuestContactsDoc(db, eventId, result.id)
    expect(contact?.phone).toBe('11-2222-3333')
  })

  it('lets a co-organizer with addGuests but without editGuests add a guest', async () => {
    const COORG_UID = 'coorg-addonly-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: true, editGuests: false } },
    })

    const result = await addGuest.run(fakeCallableRequest({ eventId, name: 'Ana' }, COORG_UID))

    expect(result.status).toBe('success')
  })

  it('returns status "full" (not an error) once the event reaches capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 5, guestCount: 5, peopleCount: 5 })

    const result = await addGuest.run(fakeCallableRequest({ eventId, name: 'Invitado 6' }, OWNER_UID))

    expect(result).toEqual({ status: 'full' })
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(5)
  })

  // Rediseño del Dashboard del Evento (2026-08-11, unificación Lista/
  // Auto-registro): antes el alta manual ignoraba EventData.maxCompanions
  // por completo; ahora lo respeta igual que auto-registro, para
  // acompañantes INDIVIDUALES (no para "familia o grupo", ver el test de
  // isGroup más abajo).
  it('respects the event maxCompanions for a manual add of individual companions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, maxCompanions: 1, guestCount: 0, peopleCount: 0 })

    await expect(addGuest.run(fakeCallableRequest(
      { eventId, name: 'Ana', companions: [{}, {}, {}, {}, {}] },
      OWNER_UID,
    ))).rejects.toThrow(HttpsError)
  })

  it('allows a manual add within the event maxCompanions', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, maxCompanions: 2, guestCount: 0, peopleCount: 0 })

    const result = await addGuest.run(fakeCallableRequest(
      { eventId, name: 'Ana', companions: [{}, {}] },
      OWNER_UID,
    ))

    expect(result.status).toBe('success')
    if (result.status !== 'success') throw new Error('unreachable')
    const guestDoc = await getGuestDoc(db, eventId, result.id)
    expect(guestDoc?.companions).toHaveLength(2)
  })

  it('stamps registrationSource: "organizer" on a manually added guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    const result = await addGuest.run(fakeCallableRequest({ eventId, name: 'Ana' }, OWNER_UID))
    if (result.status !== 'success') throw new Error('unreachable')

    const guestDoc = await getGuestDoc(db, eventId, result.id)
    expect(guestDoc?.registrationSource).toBe('organizer')
  })

  it('still rejects more companions than the technical ceiling (GUEST_MAX_COMPANIONS), without creating the guest', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, guestCount: 0, peopleCount: 0 })

    await expect(
      addGuest.run(fakeCallableRequest(
        { eventId, name: 'Ana', companions: Array.from({ length: GUEST_MAX_COMPANIONS + 1 }, () => ({})) },
        OWNER_UID,
      )),
    ).rejects.toThrow(HttpsError)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(0)
  })

  it('lets isGroup:true bypass the maxCompanions limit', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, maxCompanions: 0, guestCount: 0, peopleCount: 0 })

    const result = await addGuest.run(fakeCallableRequest({
      eventId,
      name: 'Eric',
      lastName: 'Muñoz',
      companions: [
        { name: 'Ana', lastName: 'Muñoz' },
        { name: 'Carlos', lastName: 'Muñoz' },
        { name: 'María', lastName: 'García' },
        { name: 'Luis', lastName: 'Muñoz' },
      ],
      isGroup: true,
    }, OWNER_UID))

    expect(result.status).toBe('success')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(5)
  })

  it('rejects an unauthenticated caller', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(addGuest.run(fakeCallableRequest({ eventId, name: 'Ana' }))).rejects.toThrow(HttpsError)
  })

  it('rejects a caller without addGuests permission', async () => {
    const COORG_UID = 'coorg-noadd-uid'
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, {
      ownerId: OWNER_UID,
      coOrganizersMap: { [COORG_UID]: true },
      coOrganizerPermissions: { [COORG_UID]: { addGuests: false } },
    })

    await expect(
      addGuest.run(fakeCallableRequest({ eventId, name: 'Ana' }, COORG_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a nonexistent event', async () => {
    await expect(
      addGuest.run(fakeCallableRequest({ eventId: uniqueId('event'), name: 'Ana' }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('rejects a name that is too long', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID })

    await expect(
      addGuest.run(fakeCallableRequest({ eventId, name: 'A'.repeat(200) }, OWNER_UID)),
    ).rejects.toThrow(HttpsError)
  })

  it('never lets two concurrent calls for the last spot both succeed', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { ownerId: OWNER_UID, capacity: 200, guestCount: 199, peopleCount: 199 })

    const results = await Promise.all([
      addGuest.run(fakeCallableRequest({ eventId, name: 'Carrera A' }, OWNER_UID)),
      addGuest.run(fakeCallableRequest({ eventId, name: 'Carrera B' }, OWNER_UID)),
    ])

    const succeeded = results.filter((r) => r.status === 'success')
    const full = results.filter((r) => r.status === 'full')
    expect(succeeded).toHaveLength(1)
    expect(full).toHaveLength(1)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(200)
  })
})
