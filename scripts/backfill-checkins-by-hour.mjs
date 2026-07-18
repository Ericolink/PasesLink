// Recalcula EventData.checkinsByHour para eventos EXISTENTES, agrupando por
// hora del día (mismo criterio que el gráfico "Llegadas por hora" de
// Reports.tsx antes de este cambio: new Date(timestamp).getHours(), solo
// checkins con type === 'check_in', reingresos incluidos) a partir del
// historial ya guardado en events/{eventId}/checkins. Pensado para correrse
// UNA SOLA VEZ, a mano, el día que se despliegue el cambio que empieza a
// mantener este contador con increment() en checkInGuest/
// confirmPaymentAndCheckIn — así un evento que ya tenga check-ins escaneados
// antes de ese cambio no arranca con el gráfico vacío o incompleto.
//
// Uso:
//   node scripts/backfill-checkins-by-hour.mjs
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

function hourLabelOf(timestamp) {
  const date = typeof timestamp?.toDate === 'function' ? timestamp.toDate() : new Date(timestamp)
  return `${date.getHours().toString().padStart(2, '0')}:00`
}

function sameHourCounts(a, b) {
  const aEntries = Object.entries(a || {})
  const bEntries = Object.entries(b || {})
  if (aEntries.length !== bEntries.length) return false
  return aEntries.every(([hour, count]) => b?.[hour] === count)
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let updated = 0
  for (const eventDoc of eventsSnap.docs) {
    const checkinsSnap = await eventDoc.ref.collection('checkins').where('type', '==', 'check_in').get()
    const checkinsByHour = {}
    for (const c of checkinsSnap.docs) {
      const label = hourLabelOf(c.data().timestamp)
      checkinsByHour[label] = (checkinsByHour[label] || 0) + 1
    }
    if (!sameHourCounts(eventDoc.data().checkinsByHour, checkinsByHour)) {
      await eventDoc.ref.update({ checkinsByHour })
      updated++
      console.log(`${eventDoc.id}: checkinsByHour -> ${JSON.stringify(checkinsByHour)}`)
    }
  }
  console.log(`Eventos actualizados: ${updated}/${eventsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de checkinsByHour falló:', err)
  process.exitCode = 1
})
