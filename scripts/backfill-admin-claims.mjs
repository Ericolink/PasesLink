// Otorga el custom claim `admin: true` a cada uid que ya tiene un documento
// en admins/{uid} — ver FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md Fase C.
// Necesario porque functions/src/triggers/onAdminWritten.ts solo reacciona a
// escrituras FUTURAS de esa colección: los admins que ya existían antes de
// desplegar ese trigger no tienen el claim hasta correr esto una vez.
//
// Uso:
//   node scripts/backfill-admin-claims.mjs
//
// Credenciales: mismo patrón que scripts/backfill-paid-count.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador (nota:
// el emulador de Firestore no emula Auth — contra el emulador este script
// falla al llamar setCustomUserClaims salvo que también corra el emulador de
// Auth, cosa que este proyecto no tiene configurada; usarlo solo como
// smoke-test de la lectura de `admins/`, no del lado de Auth).
//
// NO está programado en GitHub Actions — es un one-off manual, no un
// proceso recurrente (mismo criterio que el resto de scripts/backfill-*.mjs).
// Idempotente: otorgar el claim a alguien que ya lo tiene es un no-op.
import { cert, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT_ID = 'app-pases-9e6e7'

function initApp() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return initializeApp({ projectId: PROJECT_ID })
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error(
      'Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).',
    )
  }
  return initializeApp({ credential: cert(JSON.parse(raw)) })
}

async function main() {
  initApp()
  const db = getFirestore()
  const auth = getAuth()

  const adminsSnap = await db.collection('admins').get()
  let updated = 0
  for (const adminDoc of adminsSnap.docs) {
    const uid = adminDoc.id
    const user = await auth.getUser(uid)
    if (user.customClaims?.admin === true) continue
    await auth.setCustomUserClaims(uid, { admin: true })
    updated++
    console.log(`${uid}: claim admin:true otorgado`)
  }
  console.log(`Admins actualizados: ${updated}/${adminsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de admin claims falló:', err)
  process.exitCode = 1
})
