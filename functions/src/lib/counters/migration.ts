// Herramientas de migración de un contador puntual a shards — se invocan a
// mano (script de mantenimiento, ver scripts/) por un admin, nunca
// automático. La estrategia real (qué modo usa cada contador) sigue viviendo
// en config.ts — estas funciones solo preparan los datos para que el cambio
// de estrategia (que sí requiere editar config.ts y deployar) empiece sin
// drift. Ver "Estrategia de migración" en docs/sharded-counters.md.
import type { Firestore } from 'firebase-admin/firestore'
import { COUNTER_REGISTRY } from './config.js'
import { sumShards } from './shardedAdapter.js'
import type { CounterName } from './types.js'

export interface SeedShardsResult {
  counter: CounterName
  eventId: string
  seededValue: number
  shardCount: number
}

/**
 * Paso 1 de la migración: siembra los shards con el valor actual del campo
 * plano (todo en el shard 0, el resto en 0 — los shards se van a repartir
 * solos con las escrituras reales una vez que config.ts pase a 'dual'). Se
 * puede correr con el servicio en producción: solo crea documentos nuevos,
 * no toca el campo plano ni ninguna transacción de negocio.
 */
export async function seedShardsFromCurrentValue(
  db: Firestore,
  eventId: string,
  counter: CounterName,
): Promise<SeedShardsResult> {
  const def = COUNTER_REGISTRY[counter]
  const eventSnap = await db.collection('events').doc(eventId).get()
  const currentValue = (eventSnap.data()?.[counter] as number) ?? 0

  const shardsCol = db.collection('events').doc(eventId).collection('counterShards')
  const batch = db.batch()
  for (let i = 0; i < def.shardCount; i += 1) {
    batch.set(shardsCol.doc(`${counter}_${i}`), { value: i === 0 ? currentValue : 0 }, { merge: false })
  }
  await batch.commit()

  return { counter, eventId, seededValue: currentValue, shardCount: def.shardCount }
}

export interface ValidateShardsResult {
  counter: CounterName
  eventId: string
  shardSum: number
  cachedValue: number
  drift: number
  consistent: boolean
}

/**
 * Paso 2 (correr repetidas veces mientras el contador esté en 'dual'):
 * compara la suma real de shards contra el campo plano — deben coincidir
 * mientras 'dual' escriba ambos. Drift persistente es señal de NO pasar a
 * 'sharded' todavía.
 */
export async function validateShardsAgainstCache(
  db: Firestore,
  eventId: string,
  counter: CounterName,
): Promise<ValidateShardsResult> {
  const def = COUNTER_REGISTRY[counter]
  const [shardSum, eventSnap] = await Promise.all([
    sumShards(db, eventId, counter, def.shardCount),
    db.collection('events').doc(eventId).get(),
  ])
  const cachedValue = (eventSnap.data()?.[counter] as number) ?? 0
  const drift = shardSum - cachedValue
  return { counter, eventId, shardSum, cachedValue, drift, consistent: drift === 0 }
}

/**
 * Rollback: borra los shards de un contador (para reintentar la siembra, o
 * para limpiar después de decidir no migrar). Seguro en cualquier momento
 * mientras config.ts tenga el contador en 'traditional' — nada lee esos
 * documentos en ese modo.
 */
export async function deleteCounterShards(db: Firestore, eventId: string, counter: CounterName): Promise<void> {
  const def = COUNTER_REGISTRY[counter]
  const batch = db.batch()
  const shardsCol = db.collection('events').doc(eventId).collection('counterShards')
  for (let i = 0; i < def.shardCount; i += 1) {
    batch.delete(shardsCol.doc(`${counter}_${i}`))
  }
  await batch.commit()
}
