// Siembra EventData.walkInNetCount para eventos EXISTENTES a partir del
// checkedInCount/occupancyCount ya guardado — necesario UNA SOLA VEZ porque
// es un contador genuinamente nuevo (mismo motivo que tuvo backfill-paid-count.mjs
// en su momento, ver git log): antes de este cambio, la porción de
// checkedInCount/occupancyCount que corresponde a walk-ins (src/firebase/
// capacity.ts — no crean documento de invitado) vivía mezclada sin forma de
// separarla, así que reconcileGuestCounters.ts (functions/src/reconciliation/)
// no podía recomponer esos dos contadores desde guests/ sin walkInNetCount
// como tercera pieza. Sin este backfill, el primer barrido tras desplegar
// arrancaría walkInNetCount en 0 y borraría de un plumazo la porción de
// walk-ins de cualquier evento con gente adentro que entró por esa puerta.
//
// occupancyCount es el que se usa como gate real (walkIn compara contra él,
// ver capacity.ts) — se toma como fuente canónica: walkInNetCount inferido =
// max(0, occupancyCount actual - ocupación actual derivada de guests/). Si
// checkedInCount sugiere un valor de walk-ins distinto (posible si ya había
// drift previo), se deja como advertencia en el log, no bloquea el backfill.
//
// Uso:
//   node scripts/backfill-walkin-net-count.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (JSON completo de la service
// account) o FIRESTORE_EMULATOR_HOST para probar contra el emulador.
//
// NO está programado en GitHub Actions — es un one-off manual, no un proceso
// recurrente. Idempotente: puede correrse más de una vez sin problema (si ya
// hay un walkInNetCount guardado y sigue siendo consistente con occupancyCount/
// checkedInCount, no vuelve a escribir).
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

// Mismo criterio que partySize()/normalizeCompanions() en src/firebase/guests.ts.
function partySizeOf(guestData) {
  const companions = guestData.companions
  if (typeof companions === 'number') return 1 + companions
  if (Array.isArray(companions)) return 1 + companions.length
  return 1
}

// Copia de guestPresence (functions/src/checkin/shared.ts / src/firebase/guests.ts).
function isInside(guestData) {
  if (guestData.status !== 'checked_in') return false
  return !guestData.checkedOutAt
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events').get()
  let updated = 0
  for (const eventDoc of eventsSnap.docs) {
    const guestsSnap = await eventDoc.ref.collection('guests').get()
    let currentlyInside = 0
    let checkedInCumulative = 0
    for (const g of guestsSnap.docs) {
      const data = g.data()
      const partySize = partySizeOf(data)
      if (data.status === 'checked_in') checkedInCumulative += partySize
      if (isInside(data)) currentlyInside += partySize
    }

    const data = eventDoc.data()
    const occupancyCount = data.occupancyCount || 0
    const checkedInCount = data.checkedInCount || 0
    const walkInFromOccupancy = Math.max(0, occupancyCount - currentlyInside)
    const walkInFromCheckedIn = Math.max(0, checkedInCount - checkedInCumulative)
    if (walkInFromOccupancy !== walkInFromCheckedIn) {
      console.warn(
        `${eventDoc.id}: walkInNetCount inferido difiere según la fuente (occupancyCount->${walkInFromOccupancy}, checkedInCount->${walkInFromCheckedIn}) — probable drift previo, se usa el de occupancyCount.`,
      )
    }

    if (data.walkInNetCount !== walkInFromOccupancy) {
      await eventDoc.ref.update({ walkInNetCount: walkInFromOccupancy })
      updated++
      console.log(`${eventDoc.id}: walkInNetCount -> ${walkInFromOccupancy}`)
    }
  }
  console.log(`Eventos actualizados: ${updated}/${eventsSnap.size}`)
}

main().catch((err) => {
  console.error('Backfill de walkInNetCount falló:', err)
  process.exitCode = 1
})
