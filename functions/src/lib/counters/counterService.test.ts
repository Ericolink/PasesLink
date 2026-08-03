// COUNTER_REGISTRY se mockea por test (vi.hoisted + getter) para poder
// ejercitar 'traditional'/'dual'/'sharded' sin depender de qué haya
// configurado config.ts en un momento dado — ese archivo en sí queda en
// 'traditional' para todos los contadores reales (ver comentario ahí).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Firestore } from 'firebase-admin/firestore'
import { clearFirestoreEmulator, getTestFirestore, seedEvent, uniqueId } from '../../__tests__/helpers.js'
import type { CounterRegistry } from './types.js'

const registryHolder = vi.hoisted(() => ({
  registry: {
    checkedInCount: { strategy: 'traditional', shardCount: 10, gated: false },
    occupancyCount: { strategy: 'traditional', shardCount: 10, gated: true },
    peopleCount: { strategy: 'traditional', shardCount: 10, gated: true },
    guestCount: { strategy: 'traditional', shardCount: 10, gated: false },
    paidCount: { strategy: 'traditional', shardCount: 10, gated: false },
    rsvpYesCount: { strategy: 'traditional', shardCount: 10, gated: false },
    rsvpNoCount: { strategy: 'traditional', shardCount: 10, gated: false },
    rsvpPendingCount: { strategy: 'traditional', shardCount: 10, gated: false },
  } as CounterRegistry,
}))
vi.mock('./config.js', () => ({
  get COUNTER_REGISTRY() {
    return registryHolder.registry
  },
}))

const { applyCounterDeltas, getCounterTotal } = await import('./counterService.js')
const { sumShards } = await import('./shardedAdapter.js')

function setStrategy(counter: keyof CounterRegistry, strategy: CounterRegistry[keyof CounterRegistry]['strategy']) {
  registryHolder.registry[counter] = { ...registryHolder.registry[counter], strategy }
}

describe('counterService (Admin SDK)', () => {
  let db: Firestore

  beforeEach(() => {
    db = getTestFirestore()
    for (const key of Object.keys(registryHolder.registry) as (keyof CounterRegistry)[]) {
      setStrategy(key, 'traditional')
    }
  })

  afterEach(async () => {
    await clearFirestoreEmulator()
  })

  it('agrupa varios deltas traditional en un único update del campo plano', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0, occupancyCount: 0 })
    const eventRef = db.collection('events').doc(eventId)

    await db.runTransaction(async (tx) => {
      applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 3, occupancyCount: 3 })
    })

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(3)
    expect(snap.data()?.occupancyCount).toBe(3)
  })

  it('deltas en 0 no generan ninguna escritura', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 5 })
    const eventRef = db.collection('events').doc(eventId)

    await db.runTransaction(async (tx) => {
      applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 0 })
    })

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(5)
  })

  it('fusiona extraFields (p.ej. checkinsByHour) en el mismo update que los contadores', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)

    await db.runTransaction(async (tx) => {
      applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 1 }, { 'checkinsByHour.20:00': 1 })
    })

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(1)
    expect(snap.data()?.checkinsByHour).toEqual({ '20:00': 1 })
  })

  it('bajo sharded escribe en counterShards y NO toca el campo plano', async () => {
    setStrategy('checkedInCount', 'sharded')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)

    await db.runTransaction(async (tx) => {
      applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 4 })
    })

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(0)
    const shardSum = await sumShards(db, eventId, 'checkedInCount', 10)
    expect(shardSum).toBe(4)
  })

  it('bajo dual escribe en AMBOS: campo plano y shards', async () => {
    setStrategy('checkedInCount', 'dual')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)

    await db.runTransaction(async (tx) => {
      applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 4 })
    })

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(4)
    const shardSum = await sumShards(db, eventId, 'checkedInCount', 10)
    expect(shardSum).toBe(4)
  })

  it('getCounterTotal bajo sharded suma los shards dentro de la transacción', async () => {
    setStrategy('checkedInCount', 'sharded')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)

    // Tres escrituras en momentos separados (simulan tres check-ins previos).
    for (let i = 0; i < 3; i += 1) {
      await db.runTransaction(async (tx) => {
        applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 1 })
      })
    }

    const total = await db.runTransaction((tx) => getCounterTotal(db, tx, eventRef, eventId, 'checkedInCount'))
    expect(total).toBe(3)
  })

  it('N transacciones concurrentes bajo traditional no pierden escrituras (Firestore reintenta en conflicto)', async () => {
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)
    const N = 40

    await Promise.all(
      Array.from({ length: N }, () =>
        db.runTransaction(async (tx) => {
          applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 1 })
        })),
    )

    const snap = await eventRef.get()
    expect(snap.data()?.checkedInCount).toBe(N)
  })

  it('N transacciones concurrentes bajo sharded no pierden escrituras', async () => {
    setStrategy('checkedInCount', 'sharded')
    const eventId = uniqueId('event')
    await seedEvent(db, eventId, { checkedInCount: 0 })
    const eventRef = db.collection('events').doc(eventId)
    const N = 40

    await Promise.all(
      Array.from({ length: N }, () =>
        db.runTransaction(async (tx) => {
          applyCounterDeltas(db, tx, eventRef, eventId, { checkedInCount: 1 })
        })),
    )

    const shardSum = await sumShards(db, eventId, 'checkedInCount', 10)
    expect(shardSum).toBe(N)
  })
})
