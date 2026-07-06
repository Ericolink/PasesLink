// Restaura documentos desde un backup generado por backup-firestore.mjs.
// SOLO manual — nunca se llama desde CI. Restaurar sobreescribe datos reales,
// tiene que ser una decisión humana explícita cada vez.
//
// Uso:
//   node scripts/restore-firestore.mjs <carpeta-latest> [--only=guests,events] [--yes]
//
// Por defecto hace un DRY RUN (solo muestra qué haría). Agregá --yes para
// escribir de verdad. --only filtra por nombre de archivo (colección o
// subcolección) para restaurar algo puntual en vez de la base completa —
// el caso de uso típico es "recuperar UN evento borrado por error", no
// pisar toda la base con el estado de ayer.
//
// Credenciales: mismas que backup-firestore.mjs (FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
// o FIRESTORE_EMULATOR_HOST para probar).
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore, Timestamp } from 'firebase-admin/firestore'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ID = 'app-pases-9e6e7'
const BATCH_SIZE = 450

function initFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: PROJECT_ID })
    return getFirestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error(
      'Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).',
    )
  }
  initializeApp({ credential: cert(JSON.parse(raw)) })
  return getFirestore()
}

// Inverso exacto de serializeValue() en backup-firestore.mjs.
function deserializeValue(value) {
  if (value && value.__type === 'timestamp') {
    return Timestamp.fromDate(new Date(value.value))
  }
  if (Array.isArray(value)) return value.map(deserializeValue)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = deserializeValue(v)
    return out
  }
  return value
}

function parseArgs(argv) {
  const dir = argv[2]
  const only = argv.find((a) => a.startsWith('--only='))?.slice('--only='.length).split(',')
  const yes = argv.includes('--yes')
  return { dir, only, yes }
}

async function main() {
  const { dir, only, yes } = parseArgs(process.argv)
  if (!dir) {
    console.error('Uso: node scripts/restore-firestore.mjs <carpeta-latest> [--only=guests,events] [--yes]')
    process.exitCode = 1
    return
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith('.json') && f !== '_manifest.json')
  const targetFiles = only ? files.filter((f) => only.includes(f.replace('.json', ''))) : files

  if (targetFiles.length === 0) {
    console.error('Ningún archivo coincide con --only. Archivos disponibles:', files.join(', '))
    process.exitCode = 1
    return
  }

  const db = yes ? initFirestore() : null

  for (const file of targetFiles) {
    const entries = JSON.parse(await readFile(path.join(dir, file), 'utf8'))
    console.log(`${file}: ${entries.length} documentos${yes ? '' : ' (dry run, no se escribe nada)'}`)

    if (!yes) continue

    for (let i = 0; i < entries.length; i += BATCH_SIZE) {
      const batch = db.batch()
      for (const entry of entries.slice(i, i + BATCH_SIZE)) {
        batch.set(db.doc(entry.path), deserializeValue(entry.data))
      }
      await batch.commit()
    }
    console.log(`  ✓ restaurado`)
  }

  if (!yes) {
    console.log('\nEsto fue un dry run. Agregá --yes para escribir de verdad.')
  }
}

main().catch((err) => {
  console.error('Restore falló:', err)
  process.exitCode = 1
})
