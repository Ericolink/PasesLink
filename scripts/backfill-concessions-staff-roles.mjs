// Normaliza `EventData.concessions.concessionsStaffMap` del shape legado
// (uid -> email, un simple string) al shape nuevo
// (uid -> { email, roles: { cashier, prep } }) introducido con la invitación
// por enlace de encargados de "Ventas del evento" (antes "Menú").
//
// NO es obligatorio para que el sistema funcione: tanto firestore.rules
// como functions/src/lib/permissions.ts (isConcessionsCashier/isConcessionsPrep)
// y src/types/concessions.ts (resolveConcessionsStaffEntry) ya saben leer
// ambos shapes — un string legado se interpreta como solo-preparación, el
// único acceso que esos encargados ya tenían en la práctica. Este backfill
// es solo para que el panel "Encargados" del organizador muestre roles
// limpios (badges reales) en vez de un rol inferido, y para no dejar el
// shape legado conviviendo indefinidamente con el nuevo.
//
// Uso:
//   node scripts/backfill-concessions-staff-roles.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions — es un one-off manual. Idempotente:
// solo escribe eventos que todavía tengan al menos una entrada en shape
// string; correrlo dos veces no hace nada la segunda vez.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'app-pases-9e6e7'

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
  const parsed = JSON.parse(raw)
  initializeApp({ credential: cert(parsed) })
  return getFirestore()
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let updated = 0

  for (const eventDoc of eventsSnap.docs) {
    const staffMap = eventDoc.data().concessions?.concessionsStaffMap
    if (!staffMap || typeof staffMap !== 'object') continue

    const legacyUids = Object.entries(staffMap).filter(([, entry]) => typeof entry === 'string')
    if (legacyUids.length === 0) continue

    const patch = {}
    for (const [uid, email] of legacyUids) {
      patch[`concessions.concessionsStaffMap.${uid}`] = { email, roles: { cashier: false, prep: true } }
    }
    await eventDoc.ref.update(patch)
    updated++
    console.log(`${eventDoc.id}: normalizados ${legacyUids.length} encargado(s) legado(s) -> solo-preparación`)
  }

  console.log(`Eventos actualizados: ${updated}/${eventsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de roles de encargados de Ventas del evento falló:', err)
  process.exitCode = 1
})
