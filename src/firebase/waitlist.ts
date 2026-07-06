import {
  addDoc,
  collection,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { registerWalkInGuest } from './capacity'
import { requireMaxLength, requireNonEmpty, WAITLIST_NAME_MAX, WAITLIST_PHONE_MAX } from '../utils/validation'
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

  const fullName = `${name.trim()} ${lastName.trim()}`
  const result = await registerWalkInGuest(eventId, fullName, undefined, phone)
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
