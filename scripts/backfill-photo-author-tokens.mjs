// Reemplaza en photos.authorToken los qrTokens originales de invitados por
// su SHA-256 (T4 de P0-4, hallazgo N2 — la colección photos es de lectura
// pública y el qrToken da acceso al pase). Lógica y clasificación completas
// en scripts/lib/photoAuthorTokenBackfill.mjs.
//
// Uso:
//   node scripts/backfill-photo-author-tokens.mjs --project=staging --dry-run
//   node scripts/backfill-photo-author-tokens.mjs --project=staging
//   node scripts/backfill-photo-author-tokens.mjs --project=production --dry-run
//   node scripts/backfill-photo-author-tokens.mjs --project=production
//
// `--project` es obligatorio fuera del emulador, y se verifica contra el
// project_id de la service account antes de leer nada — evita correr contra
// producción con la credencial equivocada (o al revés).
//
// Credenciales: mismo patrón que el resto de scripts/backfill-*.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (producción) o
// FIREBASE_SERVICE_ACCOUNT_PASELINK_STAGING (staging), con el JSON completo
// de la service account; o FIRESTORE_EMULATOR_HOST para probar contra el
// emulador (ahí no hace falta --project).
//
// NO está programado en GitHub Actions — es un one-off manual. Idempotente:
// una foto ya migrada se reconoce por su hash y no se vuelve a tocar.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { backfillPhotoAuthorTokens } from './lib/photoAuthorTokenBackfill.mjs'

const PROJECTS = {
  production: { projectId: 'app-pases-9e6e7', credentialEnv: 'FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7' },
  staging: { projectId: 'paselink-staging', credentialEnv: 'FIREBASE_SERVICE_ACCOUNT_PASELINK_STAGING' },
}

function parseArgs(argv) {
  const args = { dryRun: false, project: null }
  for (const arg of argv.slice(2)) {
    if (arg === '--dry-run') args.dryRun = true
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length)
    else throw new Error(`Argumento desconocido: ${arg}`)
  }
  return args
}

function initFirestore(projectName) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    const projectId = process.env.GCLOUD_PROJECT || 'demo-paselink-backfill'
    initializeApp({ projectId })
    console.log(`Emulador (${process.env.FIRESTORE_EMULATOR_HOST}), proyecto ${projectId}`)
    return getFirestore()
  }
  const project = PROJECTS[projectName]
  if (!project) {
    throw new Error('Falta --project=staging o --project=production (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).')
  }
  const raw = process.env[project.credentialEnv]
  if (!raw) throw new Error(`Falta ${project.credentialEnv} con el JSON de la service account.`)
  const parsed = JSON.parse(raw)
  if (parsed.project_id !== project.projectId) {
    throw new Error(`La service account es de "${parsed.project_id}", no de "${project.projectId}". No se hizo nada.`)
  }
  initializeApp({ credential: cert(parsed), projectId: project.projectId })
  console.log(`Proyecto: ${project.projectId}`)
  return getFirestore()
}

async function main() {
  const { dryRun, project } = parseArgs(process.argv)
  const db = initFirestore(project)
  console.log(dryRun ? 'Modo dry-run: no se escribe nada.' : 'Modo escritura: se actualizará photos.authorToken.')
  const stats = await backfillPhotoAuthorTokens(db, { dryRun, log: (msg) => console.log(msg) })
  if (stats.failed.length > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error('Backfill de photos.authorToken falló:', err.message)
  process.exitCode = 1
})
