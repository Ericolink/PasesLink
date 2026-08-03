// Adaptador de contador shardeado (patrón oficial de Firestore: N
// sub-documentos, cada escritura pega en uno random, la lectura suma todos).
// IDs de shard determinísticos (`{counter}_{index}`, 0..shardCount-1) en vez
// de una query filtrada: permite leer cada shard por referencia directa
// dentro de una transacción (Transaction.get del SDK cliente solo acepta
// DocumentReference, no Query) y evita depender de un índice compuesto.
import {
  collection,
  doc,
  getDoc,
  increment,
  type DocumentData,
  type DocumentReference,
  type Firestore,
  type Transaction,
} from 'firebase/firestore'
import type { CounterName } from './types'

export interface ShardWriter {
  set(ref: DocumentReference<DocumentData>, data: Record<string, unknown>, options: { merge: true }): unknown
}

function shardRef(db: Firestore, eventId: string, counter: CounterName, index: number): DocumentReference {
  return doc(collection(db, 'events', eventId, 'counterShards'), `${counter}_${index}`)
}

function shardRefs(db: Firestore, eventId: string, counter: CounterName, shardCount: number): DocumentReference[] {
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
  writer.set(shardRef(db, eventId, counter, index), { value: increment(delta) }, { merge: true })
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
  const snaps = await Promise.all(shardRefs(db, eventId, counter, shardCount).map((ref) => getDoc(ref)))
  return snaps.reduce((sum, snap) => sum + ((snap.data()?.value as number) ?? 0), 0)
}
