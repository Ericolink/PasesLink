// Recalcula EventData.paidCount para eventos EXISTENTES, sumando partySize()
// de cada guest con paymentStatus === 'paid' (mismo criterio que
// setGuestPaymentStatus en src/firebase/guests.ts). Pensado para correrse UNA
// SOLA VEZ, a mano, el día que se despliegue el cambio que elimina el
// "apartado temporal de lugar" — así un evento que ya tenga pagos aprobados
// no arranca mostrando "Pagados: 0" de forma engañosa.
//
// Uso:
//   node scripts/backfill-paid-count.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions (a diferencia del barrido que este
// cambio elimina) — es un one-off manual, no un proceso recurrente.
// Idempotente: puede correrse más de una vez sin problema, siempre recalcula
// desde cero en vez de incrementar sobre lo ya guardado.
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

// Mismo criterio que partySize()/normalizeCompanions() en src/firebase/guests.ts:
// `companions` puede ser el formato legacy numérico (autoregistro público) o
// un array de CompanionData (organizador / auto-edición del invitado).
function partySizeOf(guestData) {
  const companions = guestData.companions
  if (typeof companions === 'number') return 1 + companions
  if (Array.isArray(companions)) return 1 + companions.length
  return 1
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let updated = 0
  for (const eventDoc of eventsSnap.docs) {
    const guestsSnap = await eventDoc.ref.collection('guests').where('paymentStatus', '==', 'paid').get()
    const paidCount = guestsSnap.docs.reduce((sum, g) => sum + partySizeOf(g.data()), 0)
    if (eventDoc.data().paidCount !== paidCount) {
      await eventDoc.ref.update({ paidCount })
      updated++
      console.log(`${eventDoc.id}: paidCount -> ${paidCount}`)
    }
  }
  console.log(`Eventos actualizados: ${updated}/${eventsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de paidCount falló:', err)
  process.exitCode = 1
})
