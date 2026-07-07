import {
  addDoc,
  collection,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { registerWalkInGuest } from './capacity'
import { getEvent } from './events'
import { requireMaxLength, requireNonEmpty, WAITLIST_NAME_MAX, WAITLIST_PHONE_MAX } from '../utils/validation'
import { defaultPaymentMethodForPromotion } from '../utils/reservation'
import type { WaitlistEntry } from '../types'
import { withListenerReporting } from '../lib/sentry'

export async function addToWaitlist(
  eventId: string,
  name: string,
  lastName: string,
  phone: string,
): Promise<void> {
  const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), WAITLIST_NAME_MAX, 'El nombre')
  const trimmedLastName = requireMaxLength(requireNonEmpty(lastName, 'El apellido'), WAITLIST_NAME_MAX, 'El apellido')
  const trimmedPhone = requireMaxLength(phone.trim(), WAITLIST_PHONE_MAX, 'El teléfono')

  await addDoc(collection(db, 'events', eventId, 'waitlist'), {
    name: trimmedName,
    lastName: trimmedLastName,
    phone: trimmedPhone,
    status: 'waiting',
    qrToken: null,
    createdAt: serverTimestamp(),
  })
}

export function subscribeToWaitlist(
  eventId: string,
  callback: (entries: WaitlistEntry[]) => void,
): Unsubscribe {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        lastName: d.data().lastName as string,
        phone: d.data().phone as string,
        status: d.data().status as WaitlistEntry['status'],
        qrToken: d.data().qrToken as string | undefined,
        createdAt:
          d.data().createdAt && typeof d.data().createdAt.toMillis === 'function'
            ? d.data().createdAt.toMillis()
            : 0,
      })),
    )
  }, withListenerReporting('waitlist'))
}

// No se puede envolver en una sola transacción: registerWalkInGuest ya abre y
// cierra la suya (runTransaction no admite anidarse). Por eso esta función
// hace 2 escrituras separadas — para que un fallo de red entre ambas no deje
// un invitado real duplicado, se re-verifica el estado del entry ANTES de
// volver a registrar (si ya está 'promoted', se devuelve su qrToken existente
// en vez de crear un segundo invitado), y si falla el segundo paso (marcar el
// entry), se loguea con el qrToken ya generado para no perder el rastro.
export async function promoteFromWaitlist(
  eventId: string,
  entryId: string,
  name: string,
  lastName: string,
  phone: string,
): Promise<string | null> {
  const entryRef = doc(db, 'events', eventId, 'waitlist', entryId)
  const entrySnap = await getDoc(entryRef)
  const existingStatus = entrySnap.data()?.status as WaitlistEntry['status'] | undefined
  if (existingStatus === 'promoted') {
    return (entrySnap.data()?.qrToken as string | undefined) || null
  }

  // Nadie eligió método en este momento (la promoción la dispara el
  // organizador o el barrido automático, no un formulario) — ver
  // defaultPaymentMethodForPromotion: preferimos 'cash' cuando el evento lo
  // ofrece para no imponerle un cronómetro de pago a alguien que no pidió
  // ser promovido justo ahora.
  const event = await getEvent(eventId)
  const paymentMethod = event?.requiresPayment
    ? defaultPaymentMethodForPromotion(event.paymentMethods)
    : undefined

  const fullName = `${name.trim()} ${lastName.trim()}`
  const result = await registerWalkInGuest(eventId, fullName, undefined, phone, undefined, undefined, paymentMethod)
  if (result.status !== 'success' || !result.qrToken) return null

  try {
    await updateDoc(entryRef, {
      status: 'promoted',
      qrToken: result.qrToken,
    })
  } catch (err) {
    console.error(
      'promoteFromWaitlist: el invitado ya se creó pero no se pudo marcar el entry como promovido. Revisar a mano.',
      { eventId, entryId, qrToken: result.qrToken, err },
    )
    throw err
  }
  return result.qrToken
}

async function getNextWaitlistEntry(eventId: string): Promise<WaitlistEntry | null> {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    where('status', '==', 'waiting'),
    orderBy('createdAt', 'asc'),
    limit(1),
  )
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  return {
    id: d.id,
    name: d.data().name as string,
    lastName: d.data().lastName as string,
    phone: d.data().phone as string,
    status: d.data().status as WaitlistEntry['status'],
    qrToken: d.data().qrToken as string | undefined,
    createdAt:
      d.data().createdAt && typeof d.data().createdAt.toMillis === 'function'
        ? d.data().createdAt.toMillis()
        : 0,
  }
}

// Ofrece automáticamente el próximo lugar liberado a quien más tiempo lleva
// en la lista de espera (pedido explícito: reserva vencida, cancelación del
// organizador o cualquier otro lugar que se libere debe promover solo, sin
// que el organizador tenga que entrar a hacerlo a mano). No valida cupo acá
// a propósito: promoteFromWaitlist → registerWalkInGuest ya lo hace dentro de
// su propia transacción y devuelve 'full' sin romper nada si, entre que se
// leyó el entry y se intentó promoverlo, el lugar se volvió a ocupar — en ese
// caso esta función simplemente no hace nada (el entry sigue 'waiting' para
// el próximo lugar que se libere).
export async function tryPromoteWaitlist(eventId: string): Promise<void> {
  const entry = await getNextWaitlistEntry(eventId)
  if (!entry) return
  await promoteFromWaitlist(eventId, entry.id, entry.name, entry.lastName, entry.phone)
}
