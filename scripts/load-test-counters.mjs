// Prueba de carga manual — compara la latencia de un contador 'traditional'
// (un solo documento, FieldValue.increment) contra un contador 'sharded' (N
// sub-documentos, un shard random por escritura) bajo distintos niveles de
// concurrencia, para encontrar en qué punto el contador tradicional empieza
// a mostrar contención real (objetivo 10 de la auditoría de sharded
// counters, ver docs/sharded-counters.md).
//
// SOLO corre contra el emulador — nunca contra producción (ver
// firestore-backups.md/memoria del proyecto: nunca se prueban flujos de
// escritura contra Firebase prod). Reimplementa el mismo patrón de
// escritura que functions/src/lib/counters/counterService.ts (Admin SDK,
// mismo criterio que ese módulo) en vez de importarlo directo, porque este
// es un script .mjs plano sin loader de TypeScript.
//
// Uso (con el emulador ya corriendo, p.ej. `firebase emulators:start --only firestore`):
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/load-test-counters.mjs
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/load-test-counters.mjs --levels=10,50,100,300 --shards=10
import { initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'demo-paselink-loadtest'

function parseArgs() {
  const args = Object.fromEntries(
    process.argv.slice(2).map((arg) => {
      const [key, value] = arg.replace(/^--/, '').split('=')
      return [key, value]
    }),
  )
  const levels = (args.levels || '10,50,100,200').split(',').map(Number)
  const shardCount = Number(args.shards || 10)
  return { levels, shardCount }
}

function initFirestore() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'Este script SOLO corre contra el emulador — seteá FIRESTORE_EMULATOR_HOST (nunca contra producción).',
    )
  }
  initializeApp({ projectId: PROJECT_ID })
  return getFirestore()
}

function percentile(sortedMs, p) {
  const index = Math.min(sortedMs.length - 1, Math.floor((p / 100) * sortedMs.length))
  return sortedMs[index]
}

async function timeConcurrentWrites(n, writeOnce) {
  const durations = []
  await Promise.all(
    Array.from({ length: n }, async () => {
      const start = Date.now()
      await writeOnce()
      durations.push(Date.now() - start)
    }),
  )
  durations.sort((a, b) => a - b)
  return {
    n,
    totalMs: durations.reduce((a, b) => a + b, 0),
    p50: percentile(durations, 50),
    p95: percentile(durations, 95),
    max: durations[durations.length - 1],
  }
}

// Mismo patrón que applyCounterDeltas bajo 'traditional' (ver
// functions/src/lib/counters/counterService.ts): una transacción, un
// FieldValue.increment sobre el ÚNICO documento del evento.
async function writeTraditional(db, eventRef) {
  await db.runTransaction(async (tx) => {
    tx.update(eventRef, { checkedInCount: FieldValue.increment(1) })
  })
}

// Mismo patrón que applyCounterDeltas bajo 'sharded' (ver
// functions/src/lib/counters/shardedAdapter.ts): un shard random dentro de
// events/{id}/counterShards/checkedInCount_{0..shardCount-1}.
async function writeSharded(db, eventRef, shardCount) {
  const index = Math.floor(Math.random() * shardCount)
  const shardRef = eventRef.collection('counterShards').doc(`checkedInCount_${index}`)
  await db.runTransaction(async (tx) => {
    tx.set(shardRef, { value: FieldValue.increment(1) }, { merge: true })
  })
}

async function main() {
  const { levels, shardCount } = parseArgs()
  const db = initFirestore()

  console.log(`Prueba de carga de contadores — shardCount=${shardCount}, niveles de concurrencia: ${levels.join(', ')}`)
  console.log('')
  console.log('concurrencia | estrategia   | total ms | p50 ms | p95 ms | max ms')
  console.log('-------------|--------------|----------|--------|--------|-------')

  for (const n of levels) {
    const traditionalEventRef = db.collection('events').doc(`loadtest-traditional-${n}-${Date.now()}`)
    await traditionalEventRef.set({ checkedInCount: 0 })
    const traditional = await timeConcurrentWrites(n, () => writeTraditional(db, traditionalEventRef))
    console.log(
      `${String(n).padEnd(12)} | traditional  | ${String(traditional.totalMs).padEnd(8)} | ${String(traditional.p50).padEnd(6)} | ${String(traditional.p95).padEnd(6)} | ${traditional.max}`,
    )

    const shardedEventRef = db.collection('events').doc(`loadtest-sharded-${n}-${Date.now()}`)
    await shardedEventRef.set({ checkedInCount: 0 })
    const sharded = await timeConcurrentWrites(n, () => writeSharded(db, shardedEventRef, shardCount))
    console.log(
      `${String(n).padEnd(12)} | sharded      | ${String(sharded.totalMs).padEnd(8)} | ${String(sharded.p50).padEnd(6)} | ${String(sharded.p95).padEnd(6)} | ${sharded.max}`,
    )
  }

  console.log('')
  console.log('Nota: el emulador corre en un solo proceso local — estos números sirven para comparar')
  console.log('la FORMA de la curva (cómo escala p95 con la concurrencia) entre las dos estrategias,')
  console.log('no como una medición absoluta de producción. La evidencia real de contención tiene que')
  console.log('salir de Cloud Monitoring en producción (ver docs/sharded-counters.md, sección de métricas).')
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
