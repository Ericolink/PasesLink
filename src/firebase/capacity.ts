import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import {
  GUEST_CUSTOM_FIELD_MAX_COUNT,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_FULL_NAME_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
} from '../utils/validation'

/** Opción A / C — Incrementa checkedInCount atómicamente. Respeta el cupo si está definido. */
export async function walkIn(eventId: string): Promise<'success' | 'full'> {
  const eventRef = doc(db, 'events', eventId)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return 'full'
    const data = snap.data()
    const capacity = data.capacity as number | null
    const current = (data.checkedInCount as number) || 0
    if (capacity && current >= capacity) return 'full'
    tx.update(eventRef, { checkedInCount: increment(1) })
    return 'success'
  })
}

/** Opción A — Decrementa checkedInCount (libera un lugar). */
export async function walkOut(eventId: string): Promise<void> {
  const eventRef = doc(db, 'events', eventId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return
    const current = (snap.data().checkedInCount as number) || 0
    if (current <= 0) return
    tx.update(eventRef, { checkedInCount: increment(-1) })
  })
}

/**
 * Opción B — Crea un invitado al instante (auto-registro público). Respeta el cupo.
 * Capa de aplicación: no confiar en que la UI ya validó. `name` llega ya
 * combinado por el llamador (EventJoin) como "Nombre Apellido" — por eso se
 * valida contra el máximo combinado, no el de una sola parte. Mismos límites
 * que firestore.rules (ver isValidPublicGuestRegistration ahí).
 */
export async function registerWalkInGuest(
  eventId: string,
  name: string,
  email?: string,
  phone?: string,
  customData?: Record<string, string>,
): Promise<{ status: 'success' | 'full'; qrToken?: string }> {
  const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre')
  const trimmedEmail = email?.trim() ? requireMaxLength(email.trim(), GUEST_EMAIL_MAX, 'El email') : ''
  const trimmedPhone = phone?.trim() ? requireMaxLength(phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
  const customEntries = Object.entries(customData || {})
  if (customEntries.length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new Error('El formulario tiene demasiados campos.')
  }
  for (const [, value] of customEntries) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos del formulario')
  }

  const eventRef = doc(db, 'events', eventId)

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return { status: 'full' }
    const data = snap.data()
    const capacity = data.capacity as number | null
    const guestCount = (data.guestCount as number) || 0
    if (capacity && guestCount >= capacity) return { status: 'full' }

    const qrToken = crypto.randomUUID().replace(/-/g, '')
    const guestRef = doc(collection(db, 'events', eventId, 'guests'))
    tx.set(guestRef, {
      name: trimmedName,
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      lockToken: null,
      notes: '',
      paymentStatus: 'unpaid',
      customData: customData || {},
      createdAt: serverTimestamp(),
    })
    // email/phone son PII: se guardan aparte en guestContacts (no público), no
    // en el documento de guests (legible por cualquiera vía /pass/:eventId/:qrToken).
    if (trimmedEmail || trimmedPhone) {
      tx.set(doc(db, 'events', eventId, 'guestContacts', guestRef.id), {
        email: trimmedEmail,
        phone: trimmedPhone,
      })
    }
    tx.update(eventRef, { guestCount: increment(1) })

    return { status: 'success', qrToken }
  })
}
