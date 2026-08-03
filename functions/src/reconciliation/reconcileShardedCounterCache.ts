// Resincroniza el campo plano (`events/{id}.{contador}`) desde la suma real
// de shards — SOLO para contadores en 'dual'/'sharded' en
// functions/src/lib/counters/config.ts. Mismo rol que reconcileGuestCounters.ts
// (recalcular la fuente de verdad y corregir drift) pero para el otro grupo
// de contadores: acá el campo plano es una CACHÉ (los shards son la fuente
// de verdad), allá el campo plano ES la fuente de verdad.
//
// Corta temprano si ningún contador está en 'dual'/'sharded' — mientras
// todos sigan en 'traditional' (el estado por defecto), este job no lee ni
// escribe nada, costo ~$0.
import type { Firestore } from 'firebase-admin/firestore'
import { COUNTER_REGISTRY } from '../lib/counters/config.js'
import { logCounterObservation } from '../lib/counters/observability.js'
import { sumShards } from '../lib/counters/shardedAdapter.js'
import type { CounterName } from '../lib/counters/types.js'

function activeShardedCounters(): CounterName[] {
  return (Object.keys(COUNTER_REGISTRY) as CounterName[]).filter(
    (name) => COUNTER_REGISTRY[name].strategy !== 'traditional',
  )
}

export interface ReconcileShardedCacheResult {
  countersActive: CounterName[]
  eventsChecked: number
  cellsUpdated: number
}

export async function reconcileAllShardedCounterCaches(db: Firestore): Promise<ReconcileShardedCacheResult> {
  const countersActive = activeShardedCounters()
  const result: ReconcileShardedCacheResult = { countersActive, eventsChecked: 0, cellsUpdated: 0 }
  if (countersActive.length === 0) return result

  const eventsSnap = await db.collection('events').get()
  result.eventsChecked = eventsSnap.size

  for (const eventDoc of eventsSnap.docs) {
    const eventData = eventDoc.data()
    for (const counter of countersActive) {
      const def = COUNTER_REGISTRY[counter]
      const shardSum = await sumShards(db, eventDoc.id, counter, def.shardCount)
      const cachedValue = (eventData[counter] as number) ?? 0
      if (shardSum !== cachedValue) {
        await eventDoc.ref.update({ [counter]: shardSum })
        result.cellsUpdated += 1
        logCounterObservation({
          counter,
          eventId: eventDoc.id,
          strategy: def.strategy,
          durationMs: 0,
          cacheDriftDetected: true,
        })
      }
    }
  }

  return result
}
