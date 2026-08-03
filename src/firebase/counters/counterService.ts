// API unificada de contadores — el resto del cliente llama
// applyCounterDeltas/getCounterTotal sin saber si cada contador vive en
// `events/{id}.{campo}` (traditional) o en `events/{id}/counterShards/*`
// (dual/sharded). Estrategia por contador: ver ./config.ts.
//
// Bajo 'traditional' (todos, hoy) el comportamiento es idéntico al código
// que reemplaza: un único `writer.update(eventRef, { campo: increment(x) })`
// por llamada, sin escrituras ni lecturas extra.
import {
  increment,
  type DocumentData,
  type DocumentReference,
  type DocumentSnapshot,
  type Transaction,
} from 'firebase/firestore'
import { db } from '../config'
import { COUNTER_REGISTRY } from './config'
import { sumShardsInTransaction, writeToRandomShard } from './shardedAdapter'
import type { CounterName } from './types'

export interface CounterWriter {
  update(ref: DocumentReference<DocumentData>, data: Record<string, unknown>): unknown
  set(ref: DocumentReference<DocumentData>, data: Record<string, unknown>, options: { merge: true }): unknown
}

/**
 * Aplica deltas a uno o más contadores en una sola operación lógica. Los
 * contadores en 'traditional'/'dual' se agrupan en un único `update()` sobre
 * `eventRef` (mismo costo de escritura que hoy); los que estén en
 * 'dual'/'sharded' además pegan en un shard random. Deltas en 0 se ignoran.
 */
export function applyCounterDeltas(
  writer: CounterWriter,
  eventRef: DocumentReference,
  deltas: Partial<Record<CounterName, number>>,
): void {
  const traditionalPatch: Record<string, unknown> = {}
  for (const [name, delta] of Object.entries(deltas) as [CounterName, number][]) {
    if (!delta) continue
    const def = COUNTER_REGISTRY[name]
    if (def.strategy === 'traditional' || def.strategy === 'dual') {
      traditionalPatch[name] = increment(delta)
    }
    if (def.strategy === 'dual' || def.strategy === 'sharded') {
      writeToRandomShard(db, writer, eventRef.id, name, def.shardCount, delta)
    }
  }
  if (Object.keys(traditionalPatch).length > 0) {
    writer.update(eventRef, traditionalPatch)
  }
}

/**
 * Lectura consistente de un contador dentro de una transacción — la única
 * forma válida de leer un contador "gate" (occupancyCount, peopleCount)
 * antes de decidir si una operación cabe. Bajo 'sharded' suma todos los
 * shards dentro de la MISMA transacción (correcto, no gratis — ver "cuándo
 * NO usar sharding en un gate" en docs/sharded-counters.md). `eventSnap`
 * opcional evita una segunda lectura de `eventRef` si el llamador ya lo leyó
 * en la misma transacción por otro motivo.
 */
export async function getCounterTotal(
  tx: Transaction,
  eventRef: DocumentReference,
  name: CounterName,
  eventSnap?: DocumentSnapshot,
): Promise<number> {
  const def = COUNTER_REGISTRY[name]
  if (def.strategy === 'sharded') {
    return sumShardsInTransaction(db, tx, eventRef.id, name, def.shardCount)
  }
  const snap = eventSnap ?? (await tx.get(eventRef))
  return (snap.data()?.[name] as number) ?? 0
}

/**
 * Inicializa contadores a un valor absoluto (alta de evento, migración,
 * tests). El alta normal de evento (events.ts) sigue escribiendo los campos
 * en 0 directo dentro del mismo `addDoc` — ya es el resultado correcto bajo
 * 'traditional'/'dual' (el shard se crea solo, perezosamente, en la primera
 * escritura real) y no hace falta pasar por acá para eso.
 */
export function initializeCounters(
  writer: CounterWriter,
  eventRef: DocumentReference,
  values: Partial<Record<CounterName, number>>,
): void {
  const patch: Record<string, unknown> = { ...values }
  if (Object.keys(patch).length > 0) writer.set(eventRef, patch, { merge: true })
}
