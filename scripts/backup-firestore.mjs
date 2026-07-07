// Exporta todas las colecciones/subcolecciones de Firestore a JSON plano.
//
// Uso:
//   node scripts/backup-firestore.mjs [carpeta-destino]
//
// Credenciales:
//   - En CI: FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (mismo secret que ya usa
//     el deploy de hosting) con el JSON completo de la service account.
//   - Local, contra el emulador: seteá FIRESTORE_EMULATOR_HOST=localhost:8080
//     (con `firebase emulators:start --only firestore` corriendo aparte) y no
//     hace falta ninguna credencial real.
//
// No requiere Blaze: el Admin SDK lee/escribe Firestore en el plan Spark sin
// problema — lo que requiere Blaze es Cloud Storage/Scheduler/Functions, no
// esto (que corre como script normal de Node, disparado por GitHub Actions).
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const PROJECT_ID = 'app-pases-9e6e7'

// Colecciones de nivel superior (ver firestore.rules para la lista completa).
const TOP_LEVEL_COLLECTIONS = [
  'admins',
  'users',
  'events',
  'feedback',
  'feedbackRateLimits',
  'reports',
  'reportRateLimits',
  'reportDedup',
  'sanctions',
  'adminAuditLog',
]

// Subcolecciones anidadas bajo distintos padres (events/{id}/guests,
// users/{uid}/invitations, etc.) — collectionGroup trae TODAS sin tener que
// enumerar cada padre a mano.
const SUBCOLLECTION_GROUPS = [
  'invitations',
  'guests',
  'guestContacts',
  'checkins',
  'waitlist',
  'wall',
  'photos',
  'history',
  'targets',
]

function initFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    // El SDK detecta FIRESTORE_EMULATOR_HOST solo y no valida credenciales.
    initializeApp({ projectId: PROJECT_ID })
    return getFirestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error(
      'Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).',
    )
  }
  const parsed = JSON.parse(raw)
  initializeApp({ credential: cert(parsed) })
  return getFirestore()
}

// Los Timestamp de Firestore no sobreviven un JSON.stringify tal cual —
// se marcan con __type para que restore-firestore.mjs los reconstruya
// exactos (no como string suelto), ya que gran parte del código de la app
// espera un objeto con `.toMillis()` en estos campos (ver el patrón
// `toMillis()` repetido en src/firebase/*.ts).
function serializeValue(value) {
  if (value && typeof value.toDate === 'function') {
    return { __type: 'timestamp', value: value.toDate().toISOString() }
  }
  if (Array.isArray(value)) return value.map(serializeValue)
  if (value && typeof value === 'object') {
    const out = {}
    for (const [k, v] of Object.entries(value)) out[k] = serializeValue(v)
    return out
  }
  return value
}

async function exportDocs(snapshot) {
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    path: doc.ref.path,
    data: serializeValue(doc.data()),
  }))
}

async function main() {
  const outDir = path.join(process.argv[2] || './backups-data', 'latest')
  await mkdir(outDir, { recursive: true })

  const db = initFirestore()
  const manifest = { generatedAt: new Date().toISOString(), counts: {} }

  for (const name of TOP_LEVEL_COLLECTIONS) {
    const snap = await db.collection(name).get()
    const docs = await exportDocs(snap)
    manifest.counts[name] = docs.length
    await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2))
    console.log(`✓ ${name}: ${docs.length} documentos`)
  }

  for (const name of SUBCOLLECTION_GROUPS) {
    const snap = await db.collectionGroup(name).get()
    const docs = await exportDocs(snap)
    manifest.counts[name] = docs.length
    await writeFile(path.join(outDir, `${name}.json`), JSON.stringify(docs, null, 2))
    console.log(`✓ ${name} (subcolección): ${docs.length} documentos`)
  }

  await writeFile(path.join(outDir, '_manifest.json'), JSON.stringify(manifest, null, 2))
  console.log(`\nBackup completo en ${outDir}`)
}

main().catch((err) => {
  console.error('Backup falló:', err)
  process.exitCode = 1
})
