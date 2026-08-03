// COUNTER_REGISTRY se mockea por test (mismo criterio que el `db` singleton
// de abajo) para poder probar 'sharded'/'dual' sin depender de qué tenga
// configurado counters/config.ts en un momento dado (ahí todo sigue en
// 'traditional' — ver ese archivo).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, runTransaction, type Firestore } from 'firebase/firestore'
import { createTestEnv, seedEvent, type EmulatorFirestore } from './helpers'
import type { CounterRegistry } from '../counters/types'

const dbHolder = vi.hoisted(() => ({ db: undefined as unknown as EmulatorFirestore }))
vi.mock('../config', () => ({
  get db() {
    return dbHolder.db
  },
}))

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
vi.mock('../counters/config', () => ({
  get COUNTER_REGISTRY() {
    return registryHolder.registry
  },
}))

import { applyCounterDeltas, getCounterTotal } from '../counters/counterService'
import { sumShards } from '../counters/shardedAdapter'

const OWNER_UID = 'owner-uid'

function setStrategy(counter: keyof CounterRegistry, strategy: CounterRegistry[keyof CounterRegistry]['strategy']) {
  registryHolder.registry[counter] = { ...registryHolder.registry[counter], strategy }
}

describe('counterService (cliente, emulador)', () => {
  let testEnv: RulesTestEnvironment

  beforeAll(async () => {
    testEnv = await createTestEnv()
  })

  beforeEach(() => {
    for (const key of Object.keys(registryHolder.registry) as (keyof CounterRegistry)[]) {
      setStrategy(key, 'traditional')
    }
  })

  afterEach(async () => {
    await testEnv.clearFirestore()
  })

  afterAll(async () => {
    await testEnv.cleanup()
  })

  it('agrupa varios deltas traditional en un único update, respetando firestore.rules del dueño', async () => {
    const eventId = 'event-1'
    await seedEvent(testEnv, eventId, { checkedInCount: 0, occupancyCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const eventRef = doc(dbHolder.db, 'events', eventId)

    await runTransaction(dbHolder.db, async (tx) => {
      applyCounterDeltas(tx, eventRef, { checkedInCount: 2, occupancyCount: 2 })
    })

    const snap = await getDoc(eventRef)
    expect(snap.data()?.checkedInCount).toBe(2)
    expect(snap.data()?.occupancyCount).toBe(2)
  })

  it('N transacciones concurrentes bajo traditional no pierden escrituras', async () => {
    const eventId = 'event-1'
    await seedEvent(testEnv, eventId, { checkedInCount: 0 })
    dbHolder.db = testEnv.authenticatedContext(OWNER_UID).firestore()
    const eventRef = doc(dbHolder.db, 'events', eventId)
    const N = 25

    await Promise.all(
      Array.from({ length: N }, () =>
        runTransaction(dbHolder.db, async (tx) => {
          applyCounterDeltas(tx, eventRef, { checkedInCount: 1 })
        })),
    )

    const snap = await getDoc(eventRef)
    expect(snap.data()?.checkedInCount).toBe(N)
  })

  // 'sharded'/'dual' todavía no tienen una regla propia para
  // events/{id}/counterShards/* en firestore.rules (no hace falta mientras
  // ningún contador use esa estrategia en producción, ver
  // docs/sharded-counters.md) — se prueba acá con las rules deshabilitadas,
  // igual que seedEvent/seedGuest, para validar solo el mecanismo. Antes de
  // activar 'sharded'/'dual' desde el cliente en un contador real, agregar
  // esa regla es un paso obligatorio del checklist de migración.
  it('bajo sharded escribe en counterShards y no toca el campo plano', async () => {
    setStrategy('checkedInCount', 'sharded')
    const eventId = 'event-1'
    await seedEvent(testEnv, eventId, { checkedInCount: 0 })

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as EmulatorFirestore
      dbHolder.db = db
      const eventRef = doc(db, 'events', eventId)
      await runTransaction(db, async (tx) => {
        applyCounterDeltas(tx, eventRef, { checkedInCount: 5 })
      })
      const snap = await getDoc(eventRef)
      expect(snap.data()?.checkedInCount).toBe(0)
      const shardSum = await sumShards(db as unknown as Firestore, eventId, 'checkedInCount', 10)
      expect(shardSum).toBe(5)
    })
  })

  it('getCounterTotal bajo sharded suma los shards dentro de la transacción', async () => {
    setStrategy('checkedInCount', 'sharded')
    const eventId = 'event-1'
    await seedEvent(testEnv, eventId, { checkedInCount: 0 })

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore() as unknown as EmulatorFirestore
      dbHolder.db = db
      const eventRef = doc(db, 'events', eventId)
      for (let i = 0; i < 3; i += 1) {
        await runTransaction(db, async (tx) => {
          applyCounterDeltas(tx, eventRef, { checkedInCount: 1 })
        })
      }
      const total = await runTransaction(db, (tx) => getCounterTotal(tx, eventRef, 'checkedInCount'))
      expect(total).toBe(3)
    })
  })
})
