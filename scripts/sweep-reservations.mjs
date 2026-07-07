// Libera lugares reservados que vencieron sin resolverse y los ofrece
// automáticamente a la lista de espera. Dos plazos distintos comparten esta
// misma barrida (ver GuestPaymentStatus en src/types/index.ts):
//   - 'unpaid' con holdExpiresAt vencido: autoregistro por transferencia que
//     nunca marcó "ya pagué" dentro del plazo original (20 min).
//   - 'pending_confirmation' con holdExpiresAt vencido: marcó "ya pagué" pero
//     el organizador no lo aprobó ni rechazó dentro del SLA (48h).
// Ambos casos terminan igual: paymentStatus -> 'expired', se libera el cupo
// del evento, se intenta promover a la lista de espera.
//
// Uso:
//   node scripts/sweep-reservations.mjs
//
// Credenciales: mismo patrón que scripts/backup-firestore.mjs —
// FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 en CI, o FIRESTORE_EMULATOR_HOST
// para probar local contra el emulador. No requiere Blaze (ver ese mismo
// comentario en backup-firestore.mjs).
//
// Por qué un script aparte y no Cloud Functions: este proyecto evita Blaze.
// Un cron de GitHub Actions + Admin SDK (mismo mecanismo que
// firestore-backup.yml) logra el mismo resultado gratis. La UI (GuestPass/
// GuestList/Scanner) ya muestra "vencida" al instante calculándolo del lado
// del cliente (ver isHoldExpired en src/utils/reservation.ts) aunque el
// barrido todavía no haya corrido — lo único que depende del cron es CUÁNDO
// se libera el cupo real para la siguiente persona en la lista de espera.
//
// No usa código de src/firebase/*.ts a propósito: esos archivos importan el
// SDK de cliente (`firebase/firestore`), este script usa el Admin SDK
// (`firebase-admin/firestore`) — son paquetes distintos con superficies de
// API similares pero no intercambiables. La lógica de negocio se duplica
// intencionalmente en forma reducida — si cambia en capacity.ts/guests.ts/
// waitlist.ts/utils/reservation.ts, hay que revisarla acá también.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

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
  initializeApp({ credential: cert(JSON.parse(raw)) })
  return getFirestore()
}

// Mismo cálculo que partySize() en src/firebase/guests.ts, adaptado al
// formato crudo de Firestore: `companions` de un autoregistro (el único
// camino que puede llegar a 'pending_confirmation'/'expired', ver
// capacity.ts) siempre se guarda como número (formato legacy), nunca como
// array — se cubren ambos casos igual por si el dato viniera de otro lado.
function partySizeOf(guestData) {
  const companions = guestData.companions
  if (typeof companions === 'number') return 1 + companions
  if (Array.isArray(companions)) return 1 + companions.length
  return 1
}

// Mismo criterio que defaultPaymentMethodForPromotion en src/utils/reservation.ts.
function defaultMethodForPromotion(paymentMethods) {
  return (paymentMethods || []).includes('cash') ? 'cash' : 'transfer'
}

// Mismo criterio que initialHoldExpiresAt en src/utils/reservation.ts.
function initialHoldExpiresAt(requiresPayment, method) {
  if (!requiresPayment) return null
  if (method !== 'transfer') return null
  return Date.now() + RESERVATION_HOLD_MS
}

const RESERVATION_HOLD_MS = 20 * 60 * 1000

// Vence una reserva puntual (holding original o pending_confirmation, según
// en qué estado esté realmente al leerla dentro de la transacción — no se
// confía en el estado que trajo la query, puede haber cambiado entre medio,
// p.ej. si el invitado tocó "ya pagué" justo antes de que esto corriera).
async function expireOne(db, guestSnap) {
  const eventRef = guestSnap.ref.parent.parent
  const guestRef = guestSnap.ref

  return db.runTransaction(async (tx) => {
    const [freshGuestSnap, freshEventSnap] = await Promise.all([tx.get(guestRef), tx.get(eventRef)])
    if (!freshGuestSnap.exists || !freshEventSnap.exists) return false
    const guest = freshGuestSnap.data()
    if (guest.paymentStatus !== 'unpaid' && guest.paymentStatus !== 'pending_confirmation') return false
    const expiresAtMs = Number(guest.holdExpiresAt)
    if (!expiresAtMs || expiresAtMs > Date.now()) return false

    const size = partySizeOf(guest)
    tx.update(guestRef, { paymentStatus: 'expired' })
    tx.update(eventRef, {
      guestCount: FieldValue.increment(-1),
      peopleCount: FieldValue.increment(-size),
    })
    return true
  })
}

async function tryPromote(db, eventRef) {
  const waitlistSnap = await eventRef
    .collection('waitlist')
    .where('status', '==', 'waiting')
    .orderBy('createdAt', 'asc')
    .limit(1)
    .get()
  if (waitlistSnap.empty) return false
  const entryRef = waitlistSnap.docs[0].ref
  const entry = waitlistSnap.docs[0].data()

  const promoted = await db.runTransaction(async (tx) => {
    const [entrySnap, eventSnap] = await Promise.all([tx.get(entryRef), tx.get(eventRef)])
    if (!entrySnap.exists || entrySnap.data().status !== 'waiting') return null
    if (!eventSnap.exists) return null
    const event = eventSnap.data()
    const capacity = event.capacity || 0
    const guestCount = event.guestCount || 0
    if (capacity && guestCount >= capacity) return null

    const method = event.requiresPayment ? defaultMethodForPromotion(event.paymentMethods) : null
    const holdExpiresAt = initialHoldExpiresAt(event.requiresPayment, method)
    const qrToken = crypto.randomUUID().replace(/-/g, '')
    const guestRef = eventRef.collection('guests').doc()
    tx.set(guestRef, {
      name: `${entry.name} ${entry.lastName}`.trim(),
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      notes: '',
      paymentStatus: 'unpaid',
      paymentMethod: method,
      holdExpiresAt,
      customData: {},
      createdAt: FieldValue.serverTimestamp(),
    })
    if (entry.phone) {
      tx.set(eventRef.collection('guestContacts').doc(guestRef.id), { phone: entry.phone })
    }
    tx.update(eventRef, { guestCount: FieldValue.increment(1), peopleCount: FieldValue.increment(1) })
    tx.update(entryRef, { status: 'promoted', qrToken })
    return true
  })
  return !!promoted
}

async function findExpired(db, paymentStatus) {
  return db
    .collectionGroup('guests')
    .where('paymentStatus', '==', paymentStatus)
    .where('holdExpiresAt', '<=', Date.now())
    .get()
}

async function main() {
  const db = initFirestore()

  const [expiredHolding, expiredPendingConfirmation] = await Promise.all([
    findExpired(db, 'unpaid'),
    findExpired(db, 'pending_confirmation'),
  ])
  const candidates = [...expiredHolding.docs, ...expiredPendingConfirmation.docs]
  console.log(`Candidatos a vencer: ${candidates.length} (holding: ${expiredHolding.size}, pending_confirmation: ${expiredPendingConfirmation.size})`)

  const touchedEventRefs = new Map()
  let expiredCount = 0
  for (const guestSnap of candidates) {
    try {
      const didExpire = await expireOne(db, guestSnap)
      if (didExpire) {
        expiredCount++
        const eventRef = guestSnap.ref.parent.parent
        touchedEventRefs.set(eventRef.path, eventRef)
      }
    } catch (err) {
      console.error(`Error expirando ${guestSnap.ref.path}:`, err)
    }
  }
  console.log(`Reservas expiradas: ${expiredCount}`)

  let promotedCount = 0
  for (const eventRef of touchedEventRefs.values()) {
    try {
      // Un solo lugar liberado puede abrir cupo para más de una persona en
      // la lista de espera si varias reservas vencieron en el mismo evento
      // — se repite hasta que no haya más cupo o no haya más gente esperando.
      let keepPromoting = true
      while (keepPromoting) {
        keepPromoting = await tryPromote(db, eventRef)
        if (keepPromoting) promotedCount++
      }
    } catch (err) {
      console.error(`Error promoviendo lista de espera de ${eventRef.path}:`, err)
    }
  }
  console.log(`Invitados promovidos desde lista de espera: ${promotedCount}`)
}

main().catch((err) => {
  console.error('Barrido de reservas falló:', err)
  process.exitCode = 1
})
