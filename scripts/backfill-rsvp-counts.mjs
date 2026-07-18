// Recalcula EventData.rsvpYesCount/rsvpNoCount/rsvpPendingCount para eventos
// EXISTENTES, contando documentos de `guests` por rsvpStatus (cantidad de
// invitaciones, no de personas — mismo criterio que guestCount, no
// peopleCount). Pensado para correrse UNA SOLA VEZ, a mano, el día que se
// despliegue el cambio que empieza a mantener estos contadores con
// increment() en addGuest/addGuestsBulk/addGuestsFromRows/setGuestRsvp/
// resetGuestRsvp/deleteGuest/bulkDeleteGuests/registerWalkInGuest — así un
// evento con invitados ya cargados antes de ese cambio no arranca con el
// desglose de RSVP de Reports en 0.
//
// Uso:
//   node scripts/backfill-rsvp-counts.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions — es un one-off manual, no un proceso
// recurrente. Idempotente: puede correrse más de una vez sin problema,
// siempre recalcula desde cero en vez de incrementar sobre lo ya guardado.
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
    const guestsSnap = await eventDoc.ref.collection('guests').get()
    let rsvpYesCount = 0
    let rsvpNoCount = 0
    let rsvpPendingCount = 0
    for (const g of guestsSnap.docs) {
      const status = g.data().rsvpStatus || 'pending'
      if (status === 'yes') rsvpYesCount++
      else if (status === 'no') rsvpNoCount++
      else rsvpPendingCount++
    }
    const data = eventDoc.data()
    if (data.rsvpYesCount !== rsvpYesCount || data.rsvpNoCount !== rsvpNoCount || data.rsvpPendingCount !== rsvpPendingCount) {
      await eventDoc.ref.update({ rsvpYesCount, rsvpNoCount, rsvpPendingCount })
      updated++
      console.log(`${eventDoc.id}: rsvpYesCount=${rsvpYesCount} rsvpNoCount=${rsvpNoCount} rsvpPendingCount=${rsvpPendingCount}`)
    }
  }
  console.log(`Eventos actualizados: ${updated}/${eventsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de rsvp counts falló:', err)
  process.exitCode = 1
})
