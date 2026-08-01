import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, getWaitlistEntry, seedEvent, seedWaitlistEntry, uniqueId } from '../__tests__/helpers.js'
import { runCascade } from './cascade.js'

describe('runCascade', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('is a no-op when attendeeLimitEnabled is false', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { attendeeLimitEnabled: false, capacity: 10, peopleCount: 0 })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted).toHaveLength(0)
    const entry = await getWaitlistEntry(db, eventId, 'entry-1')
    expect(entry?.status).toBe('waiting')
  })

  it('is a no-op when there is no remaining capacity', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 10 })
    await seedWaitlistEntry(db, eventId, 'entry-1')

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted).toHaveLength(0)
  })

  it('promotes the front of the queue (priorityBoost desc, createdAt asc) when one spot opens', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'first', { createdAt: 1000, priorityBoost: 0 })
    await seedWaitlistEntry(db, eventId, 'second', { createdAt: 2000, priorityBoost: 0 })

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted.map((p) => p.entryId)).toEqual(['first'])
    const second = await getWaitlistEntry(db, eventId, 'second')
    expect(second?.status).toBe('waiting')
  })

  it('respects manual priorityBoost over arrival order', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'first', { createdAt: 1000, priorityBoost: 0 })
    await seedWaitlistEntry(db, eventId, 'boosted', { createdAt: 2000, priorityBoost: 1 })

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted.map((p) => p.entryId)).toEqual(['boosted'])
  })

  it('skips a party that does not fit and offers the next one that does', async () => {
    const eventId = uniqueId('event')
    // 1 lugar libre: una familia de 3 no entra, un individuo detrás sí.
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'family', { createdAt: 1000, partySize: 3 })
    await seedWaitlistEntry(db, eventId, 'solo', { createdAt: 2000, partySize: 1 })

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted.map((p) => p.entryId)).toEqual(['solo'])
    const family = await getWaitlistEntry(db, eventId, 'family')
    expect(family?.status).toBe('waiting')
  })

  it('promotes as many entries as fit in a single run when multiple spots open at once', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 7 })
    await seedWaitlistEntry(db, eventId, 'a', { createdAt: 1000, partySize: 1 })
    await seedWaitlistEntry(db, eventId, 'b', { createdAt: 2000, partySize: 1 })
    await seedWaitlistEntry(db, eventId, 'c', { createdAt: 3000, partySize: 1 })

    const outcome = await runCascade(db, eventId)

    expect(outcome.promoted.map((p) => p.entryId)).toEqual(['a', 'b', 'c'])
  })

  it('never offers more people than the real remaining capacity when two cascades run concurrently for the same event', async () => {
    // El bug que motivó mover el chequeo de capacidad DENTRO de
    // attemptPromote (ver promote.ts): con el chequeo afuera, dos corridas
    // concurrentes de la cascada podían leer el mismo remanente y ofertarle,
    // cada una, a una entrada DISTINTA — sumando 2 ofertas para 1 solo
    // lugar real. Acá hay exactamente 1 lugar libre y 2 candidatos.
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { capacity: 10, peopleCount: 9 })
    await seedWaitlistEntry(db, eventId, 'a', { createdAt: 1000, partySize: 1 })
    await seedWaitlistEntry(db, eventId, 'b', { createdAt: 2000, partySize: 1 })

    const [outcomeA, outcomeB] = await Promise.all([runCascade(db, eventId), runCascade(db, eventId)])

    const totalPromoted = outcomeA.promoted.length + outcomeB.promoted.length
    expect(totalPromoted).toBe(1)
  })
})
