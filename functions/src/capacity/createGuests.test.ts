import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getGuestContactsDoc, getGuestDoc, getTestFirestore, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { CapacityFullError, createGuestsWithCapacity, type GuestWrite } from './createGuests.js'

function guest(name: string, companions: GuestWrite['companions'] = []): GuestWrite {
  return { name, companions }
}

describe('createGuestsWithCapacity', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('creates every guest and updates counters when the event has no attendee limit', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { attendeeLimitEnabled: false, capacity: 1, guestCount: 0, peopleCount: 0 })

    const result = await createGuestsWithCapacity(db, eventId, [guest('Ana'), guest('Beto'), guest('Caro')], 'best-fit')

    expect(result.createdIds).toHaveLength(3)
    expect(result.skipped).toEqual([])
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(3)
    expect(event.data()?.peopleCount).toBe(3)
    expect(event.data()?.rsvpPendingCount).toBe(3)
  })

  it('creates a guest and its contact + counts companions towards peopleCount', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, guestCount: 0, peopleCount: 0 })

    const result = await createGuestsWithCapacity(db, eventId, [{
      name: 'Familia Muñoz',
      companions: [{}, {}, {}],
      contact: { phone: '11-2222-3333' },
    }], 'strict')

    expect(result.createdIds).toHaveLength(1)
    const guestDoc = await getGuestDoc(db, eventId, result.createdIds[0])
    expect(guestDoc?.companions).toHaveLength(3)
    expect(guestDoc?.rsvpStatus).toBe('pending')
    const contact = await getGuestContactsDoc(db, eventId, result.createdIds[0])
    expect(contact?.phone).toBe('11-2222-3333')
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(1)
    expect(event.data()?.peopleCount).toBe(4)
  })

  it('does not write a guestContacts doc when no phone/email was provided', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10 })

    const result = await createGuestsWithCapacity(db, eventId, [guest('Sin Contacto')], 'strict')

    const contact = await getGuestContactsDoc(db, eventId, result.createdIds[0])
    expect(contact).toBeUndefined()
  })

  it('strict mode throws CapacityFullError and creates nothing once the event is full', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, guestCount: 5, peopleCount: 5 })

    await expect(createGuestsWithCapacity(db, eventId, [guest('Invitado 6')], 'strict')).rejects.toThrow(CapacityFullError)

    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(5)
    expect(event.data()?.peopleCount).toBe(5)
  })

  it('strict mode succeeds when there is exactly enough room', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, guestCount: 4, peopleCount: 4 })

    const result = await createGuestsWithCapacity(db, eventId, [guest('Invitado 5')], 'strict')

    expect(result.createdIds).toHaveLength(1)
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.peopleCount).toBe(5)
  })

  it('best-fit mode fills only what fits and reports the rest as skipped, in order', async () => {
    const eventId = uniqueId('event')
    // Quedan 2 lugares (198/200) y se piden 5 — "llenar lo que entra +
    // reportar" (CAPACITY_LIMIT_ARCHITECTURE.md §8), nunca todo-o-nada.
    await seedEvent(db, eventId, { capacity: 200, guestCount: 198, peopleCount: 198 })

    const result = await createGuestsWithCapacity(
      db, eventId, ['Ana', 'Beto', 'Caro', 'Dani', 'Eli'].map((n) => guest(n)), 'best-fit',
    )

    expect(result.createdIds).toHaveLength(2)
    expect(result.skipped.map((g) => g.name)).toEqual(['Caro', 'Dani', 'Eli'])
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(200)
    expect(event.data()?.peopleCount).toBe(200)
  })

  it('best-fit mode skips a guest whose party size would not fit, even if a later smaller one would', async () => {
    // Queda 1 lugar — el primero pide 2 (no entra) y corta ahí, aunque el
    // segundo (1 persona) sí hubiera entrado: el orden pedido manda, no se
    // reordena para maximizar cuántos entran.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, guestCount: 4, peopleCount: 4 })

    const result = await createGuestsWithCapacity(db, eventId, [
      guest('Con acompañante', [{}]),
      guest('Solo'),
    ], 'best-fit')

    expect(result.createdIds).toHaveLength(0)
    expect(result.skipped.map((g) => g.name)).toEqual(['Con acompañante', 'Solo'])
  })

  it('subtracts active waitlist offers from the remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, guestCount: 3, peopleCount: 3 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'offered', partySize: 2 })

    // 5 - 3 - 2 ofrecidas = 0 lugares reales, aunque peopleCount diga 3/5.
    await expect(createGuestsWithCapacity(db, eventId, [guest('Invitado')], 'strict')).rejects.toThrow(CapacityFullError)
  })

  it('ignores waiting (not offered) waitlist entries when computing remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 5, guestCount: 3, peopleCount: 3 })
    await seedWaitlistEntry(db, eventId, 'entry-1', { status: 'waiting', partySize: 2 })

    const result = await createGuestsWithCapacity(db, eventId, [guest('Invitado')], 'strict')

    expect(result.createdIds).toHaveLength(1)
  })

  it('never lets two concurrent strict creations for the last spot both succeed', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 200, guestCount: 199, peopleCount: 199 })

    const results = await Promise.allSettled([
      createGuestsWithCapacity(db, eventId, [guest('Carrera A')], 'strict'),
      createGuestsWithCapacity(db, eventId, [guest('Carrera B')], 'strict'),
    ])

    const succeeded = results.filter((r) => r.status === 'fulfilled')
    const full = results.filter((r) => r.status === 'rejected' && r.reason instanceof CapacityFullError)
    expect(succeeded).toHaveLength(1)
    expect(full).toHaveLength(1)

    const event = await db.collection('events').doc(eventId).get()
    // Nunca 201/200 — exactamente una de las dos altas ganó la carrera.
    expect(event.data()?.peopleCount).toBe(200)
  })

  it('creates every guest across more than one internal chunk for a large best-fit import', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { attendeeLimitEnabled: false, capacity: 1, guestCount: 0, peopleCount: 0 })
    const names = Array.from({ length: 120 }, (_, i) => `Invitado ${i}`)

    const result = await createGuestsWithCapacity(db, eventId, names.map((n) => guest(n)), 'best-fit')

    expect(result.createdIds).toHaveLength(120)
    expect(result.skipped).toEqual([])
    const event = await db.collection('events').doc(eventId).get()
    expect(event.data()?.guestCount).toBe(120)
    expect(event.data()?.peopleCount).toBe(120)
  })
})
