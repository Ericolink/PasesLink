// Puerto Node de src/firebase/counters/shardedAdapter.ts — mismo patrón de
// IDs de shard determinísticos (`{counter}_{index}`), pero con el Admin SDK
// (permite `db.getAll` para sumar shards fuera de una transacción en una
// sola llamada, a diferencia del cliente).
import type { Firestore, Transaction } from 'firebase-admin/firestore'
import { FieldValue } from 'firebase-admin/firestore'
import type { CounterName } from './types.js'

export interface ShardWriter {
  set(ref: FirebaseFirestore.DocumentReference, data: Record<string, unknown>, options: { merge: true }): unknown
}

function shardRef(db: Firestore, eventId: string, counter: CounterName, index: number): FirebaseFirestore.DocumentReference {
  return db.collection('events').doc(eventId).collection('counterShards').doc(`${counter}_${index}`)
}

function shardRefs(db: Firestore, eventId: string, counter: CounterName, shardCount: number): FirebaseFirestore.DocumentReference[] {
  return Array.from({ length: shardCount }, (_, i) => shardRef(db, eventId, counter, i))
}

/** Escribe el delta en un shard elegido al azar — auto-crea el doc si no existía (merge + increment). */
export function writeToRandomShard(
  db: Firestore,
  writer: ShardWriter,
  eventId: string,
  counter: CounterName,
  shardCount: number,
  delta: number,
): void {
  const index = Math.floor(Math.random() * shardCount)
  writer.set(shardRef(db, eventId, counter, index), { value: FieldValue.increment(delta) }, { merge: true })
}

/** Suma consistente de todos los shards dentro de una transacción — costo: shardCount lecturas. */
export async function sumShardsInTransaction(
  db: Firestore,
  tx: Transaction,
  eventId: string,
  counter: CounterName,
  shardCount: number,
): Promise<number> {
  const snaps = await Promise.all(shardRefs(db, eventId, counter, shardCount).map((ref) => tx.get(ref)))
  return snaps.reduce((sum, snap) => sum + ((snap.data()?.value as number) ?? 0), 0)
}

/** Suma no transaccional (job de reconciliación) — eventualmente consistente, no usar para gates. */
export async function sumShards(
  db: Firestore,
  eventId: string,
  counter: CounterName,
  shardCount: number,
): Promise<number> {
  const refs = shardRefs(db, eventId, counter, shardCount)
  const snaps = refs.length > 0 ? await db.getAll(...refs) : []
  return snaps.reduce((sum, snap) => sum + ((snap.data()?.value as number) ?? 0), 0)
}
