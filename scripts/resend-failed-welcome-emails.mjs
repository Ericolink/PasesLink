// Reenvío puntual del correo de bienvenida a usuarios cuyo primer intento
// falló — típicamente por el 401 de Brevo por IP no autorizada (ver fix
// del 2026-08-30). onUserCreated.ts (functions/) hace dedup con
// `.create()` sobre users/{uid}/sendLog/welcome: una vez que ese doc queda
// en 'failed', el trigger nunca vuelve a intentar solo. Este script es el
// respaldo manual para esos casos — no corre programado, se ejecuta a mano
// cuando hace falta.
//
// Uso:
//   node scripts/resend-failed-welcome-emails.mjs            (reenvía de verdad)
//   node scripts/resend-failed-welcome-emails.mjs --dry-run  (solo lista, no envía)
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { sendEmail } from './lib/emailChannel.mjs'
import { DAILY_BUDGET_CAP, reserveBudgetSlot, todayDateKey } from './lib/dailyBudget.mjs'

const PROJECT_ID = 'app-pases-9e6e7'
const DRY_RUN = process.argv.includes('--dry-run')

function initFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: PROJECT_ID })
    return getFirestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).')
  }
  initializeApp({ credential: cert(JSON.parse(raw)) })
  return getFirestore()
}

function welcomeHtml(displayName) {
  return `<p>Hola${displayName ? ` ${displayName}` : ''},</p><p>Gracias por registrarte en PaseLink. Ya puedes crear tu primer evento o unirte a uno con el código de invitación que te compartieron.</p>`
}

async function main() {
  const db = initFirestore()

  // Mismo shape de consulta que subscribeToRecentSendFailures() en
  // src/firebase/adminAlerts.ts (status + orderBy sentAt) — es el que
  // coincide con el índice compuesto YA declarado en firestore.indexes.json
  // para sendLog a nivel COLLECTION_GROUP. Un where('status','==',...) sin
  // el orderBy no lo aprovecha como prefijo en consultas de grupo de
  // colecciones (a diferencia de una colección simple) y pide un índice de
  // campo único aparte — evitamos esa exención extra reusando el índice que
  // ya existe. El resto del filtrado (id==='welcome', colgar de users/{uid})
  // se hace a mano, mismo criterio que sendLogSource() en adminAlerts.ts.
  const snap = await db.collectionGroup('sendLog').where('status', '==', 'failed').orderBy('sentAt', 'desc').get()
  const targets = snap.docs.filter(
    (d) => d.id === 'welcome' && d.ref.parent.parent?.parent.id === 'users' && d.data().kind === 'welcome',
  )

  if (targets.length === 0) {
    console.log('No hay correos de bienvenida fallidos pendientes de reenvío.')
    return
  }
  console.log(`${targets.length} correo(s) de bienvenida fallido(s) encontrados.`)

  const todayKey = todayDateKey()
  let resent = 0
  let stillFailed = 0
  let skipped = 0

  for (const doc of targets) {
    const data = doc.data()
    const userRef = doc.ref.parent.parent
    const userSnap = await userRef.get()
    const user = userSnap.data() || {}
    const toEmail = data.toEmail || user.email

    if (!toEmail) {
      console.log(`  - ${userRef.id}: sin email registrado, se omite.`)
      skipped++
      continue
    }
    if (DRY_RUN) {
      console.log(`  - [dry-run] reenviaría a ${toEmail} (uid ${userRef.id})`)
      continue
    }

    const hasBudget = await reserveBudgetSlot(db, todayKey, DAILY_BUDGET_CAP)
    if (!hasBudget) {
      console.log('Presupuesto diario de envío (300) agotado — corre el script de nuevo mañana para el resto.')
      break
    }

    const result = await sendEmail({
      toEmail,
      toName: user.displayName,
      subject: 'Bienvenido a PaseLink',
      html: welcomeHtml(user.displayName),
    })

    if (result.ok) {
      await doc.ref.update({ status: 'sent', errorMessage: null, resentAt: new Date() })
      console.log(`  - ${toEmail}: reenviado OK.`)
      resent++
    } else {
      await doc.ref.update({ errorMessage: result.error, lastResendAttemptAt: new Date() })
      console.log(`  - ${toEmail}: sigue fallando (${result.error}).`)
      stillFailed++
    }
  }

  if (!DRY_RUN) {
    console.log(`Listo: ${resent} reenviado(s), ${stillFailed} siguen fallando, ${skipped} omitido(s) sin email.`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
