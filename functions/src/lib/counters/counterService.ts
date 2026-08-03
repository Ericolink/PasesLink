// Puerto Node de src/firebase/counters/counterService.ts (Admin SDK). API
// unificada: el resto de Cloud Functions llama applyCounterDeltas/
// getCounterTotal sin saber si cada contador vive en `events/{id}.{campo}`
// (traditional) o en `events/{id}/counterShards/*` (dual/sharded).
//
// Bajo 'traditional' (todos, hoy) el comportamiento es idéntico al código
// que reemplaza: un único `writer.update(eventRef, { campo: increment(x) })`
// por llamada, sin escrituras ni lecturas extra.
import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from 'firebase-admin/firestore'
import { COUNTER_REGISTRY } from './config.js'
import { logCounterObservation } from './observability.js'
import { sumShardsInTransaction, writeToRandomShard } from './shardedAdapter.js'
import type { CounterName } from './types.js'

export interface CounterWriter {
  update(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>): unknown
  set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, options: { merge: true }): unknown
}

/**
 * Aplica deltas a uno o más contadores en una sola operación lógica. Los
 * contadores en 'traditional'/'dual' se agrupan en un único `update()` sobre
 * `eventRef` (mismo costo de escritura que hoy); los que estén en
 * 'dual'/'sharded' además pegan en un shard random. Deltas en 0 se ignoran.
 *
 * `extraFields` fusiona campos adicionales (p.ej. el patch de
 * `checkinsByHour`, ver buildHourlyCheckinPatch) en el MISMO `update()` —
 * Firestore no permite dos `transaction.update()` separados sobre el mismo
 * documento dentro de una transacción, así que cualquier otro campo que haya
 * que tocar en `eventRef` en la misma operación tiene que viajar acá, no en
 * una llamada aparte.
 */
export function applyCounterDeltas(
  db: Firestore,
  writer: CounterWriter,
  eventRef: FirebaseFirestore.DocumentReference,
  eventId: string,
  deltas: Partial<Record<CounterName, number>>,
  extraFields?: Record<string, unknown>,
): void {
  const traditionalPatch: Record<string, unknown> = { ...extraFields }
  for (const [name, delta] of Object.entries(deltas) as [CounterName, number][]) {
    if (!delta) continue
    const def = COUNTER_REGISTRY[name]
    if (def.strategy === 'traditional' || def.strategy === 'dual') {
      traditionalPatch[name] = FieldValue.increment(delta)
    }
    if (def.strategy === 'dual' || def.strategy === 'sharded') {
      writeToRandomShard(db, writer, eventId, name, def.shardCount, delta)
      logCounterObservation({ counter: name, eventId, strategy: def.strategy, durationMs: 0, shardsWritten: 1 })
    }
  }
  if (Object.keys(traditionalPatch).length > 0) {
    writer.update(eventRef, traditionalPatch)
  }
}

/**
 * Patch (no escribe) del histograma `checkinsByHour.{hora}` — siempre
 * 'traditional' (mapa por hora, no entra en el registro de contadores
 * shardeables, ver docs/sharded-counters.md). Se pasa como `extraFields` de
 * applyCounterDeltas para fundirse en el mismo `update()` que el resto de
 * los contadores de check-in.
 */
export function buildHourlyCheckinPatch(hourLabel: string, delta = 1): Record<string, unknown> {
  return { [`checkinsByHour.${hourLabel}`]: FieldValue.increment(delta) }
}

/**
 * Lectura consistente de un contador dentro de una transacción — la única
 * forma válida de leer un contador "gate" (occupancyCount, peopleCount)
 * antes de decidir si una operación cabe. Bajo 'sharded' suma todos los
 * shards dentro de la MISMA transacción. `eventSnap` opcional evita una
 * segunda lectura de `eventRef` si el llamador ya lo leyó por otro motivo.
 */
export async function getCounterTotal(
  db: Firestore,
  tx: Transaction,
  eventRef: FirebaseFirestore.DocumentReference,
  eventId: string,
  name: CounterName,
  eventSnap?: DocumentSnapshot,
): Promise<number> {
  const def = COUNTER_REGISTRY[name]
  if (def.strategy === 'sharded') {
    return sumShardsInTransaction(db, tx, eventId, name, def.shardCount)
  }
  const snap = eventSnap ?? (await tx.get(eventRef))
  return (snap.data()?.[name] as number) ?? 0
}
