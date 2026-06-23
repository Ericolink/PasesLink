import {
  collection,
  doc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './config'
import { getEvent } from './events'
import { getUserProfile } from './userProfile'
import { sendCheckinSummaryEmail } from '../utils/emailjs'
import type { CompanionData, GuestData, GuestPaymentStatus, RsvpStatus } from '../types'

export interface NewGuestInput {
  name: string
  lastName?: string
  phone?: string
  companions?: CompanionData[]
}

function generateQrToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// `phone` NUNCA se guarda en el documento de `guests`: ese documento es
// legible públicamente (necesario para que el pase /pass/:eventId/:qrToken
// funcione sin login) y es PII. Vive aparte, en `guestContacts/{guestId}`,
// cuya regla de Firestore solo permite lectura al organizador/co-organizador/
// admin. Ver firestore.rules.
function buildNewGuestPayload(input: { name: string; lastName?: string; companions?: CompanionData[] }) {
  return {
    name: input.name,
    lastName: input.lastName || '',
    companions: input.companions || [],
    rsvpStatus: 'pending' as const,
    qrToken: generateQrToken(),
    status: 'invited' as const,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    lockToken: null,
    paymentStatus: 'unpaid' as const,
    createdAt: serverTimestamp(),
  }
}

function contactRef(eventId: string, guestId: string) {
  return doc(db, 'events', eventId, 'guestContacts', guestId)
}

export async function addGuest(eventId: string, input: NewGuestInput) {
  const batch = writeBatch(db)
  const guestRef = doc(collection(db, 'events', eventId, 'guests'))
  batch.set(guestRef, buildNewGuestPayload(input))
  if (input.phone?.trim()) {
    batch.set(contactRef(eventId, guestRef.id), { phone: input.phone.trim() })
  }
  batch.update(doc(db, 'events', eventId), { guestCount: increment(1) })
  await batch.commit()
  return guestRef.id
}

// Firestore rechaza batches de más de 500 operaciones; se reparte en chunks de
// 450 (margen para el update del contador) confirmados uno a la vez. Si un
// chunk falla, los anteriores ya quedaron guardados y guestCount refleja
// exactamente lo que se confirmó — no hay overselling silencioso ni fallo
// total al cargar listas grandes.
const BULK_CHUNK_SIZE = 450

export async function addGuestsBulk(eventId: string, names: string[]) {
  for (let i = 0; i < names.length; i += BULK_CHUNK_SIZE) {
    const slice = names.slice(i, i + BULK_CHUNK_SIZE)
    const batch = writeBatch(db)
    for (const name of slice) {
      const guestRef = doc(collection(db, 'events', eventId, 'guests'))
      batch.set(guestRef, buildNewGuestPayload({ name }))
    }
    batch.update(doc(db, 'events', eventId), { guestCount: increment(slice.length) })
    await batch.commit()
  }
}

export interface UpdateGuestInput {
  name?: string
  lastName?: string
  phone?: string
  companions?: CompanionData[]
}

export async function updateGuest(eventId: string, guestId: string, input: UpdateGuestInput) {
  const { phone, ...guestFields } = input
  const batch = writeBatch(db)
  if (Object.keys(guestFields).length > 0) {
    batch.update(doc(db, 'events', eventId, 'guests', guestId), { ...guestFields })
  }
  if (phone !== undefined) {
    batch.set(contactRef(eventId, guestId), { phone }, { merge: true })
  }
  await batch.commit()
}

export async function deleteGuest(eventId: string, guestId: string, wasCheckedIn: boolean) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'events', eventId, 'guests', guestId))
  batch.delete(contactRef(eventId, guestId))
  const updates: Record<string, unknown> = { guestCount: increment(-1) }
  if (wasCheckedIn) {
    updates.checkedInCount = increment(-1)
  }
  batch.update(doc(db, 'events', eventId), updates)
  await batch.commit()
}

// El organizador necesita el teléfono junto con el resto del invitado (lista,
// CSV), pero ese campo vive en `guestContacts` (ver buildNewGuestPayload). Se
// suscribe a ambas colecciones y se fusionan por id antes de emitir, así el
// resto de la app sigue recibiendo el mismo `GuestData[]` de siempre sin saber
// que los datos vienen de dos lugares.
export function subscribeToGuests(
  eventId: string,
  callback: (guests: GuestData[]) => void,
  onError?: (error: Error) => void,
) {
  let baseGuests: GuestData[] | null = null
  let contacts: Record<string, { phone: string }> | null = null

  function emitIfReady() {
    if (baseGuests === null || contacts === null) return
    callback(
      baseGuests.map((g) => ({
        ...g,
        phone: contacts![g.id]?.phone || g.phone,
      })),
    )
  }

  const guestsQuery = query(collection(db, 'events', eventId, 'guests'), orderBy('createdAt', 'asc'))
  const unsubGuests = onSnapshot(
    guestsQuery,
    (snapshot) => {
      baseGuests = snapshot.docs.map((d) => mapGuest(d.id, d.data()))
      emitIfReady()
    },
    onError,
  )

  const unsubContacts = onSnapshot(
    collection(db, 'events', eventId, 'guestContacts'),
    (snapshot) => {
      contacts = {}
      snapshot.docs.forEach((d) => {
        contacts![d.id] = { phone: (d.data().phone as string) || '' }
      })
      emitIfReady()
    },
    onError,
  )

  return () => {
    unsubGuests()
    unsubContacts()
  }
}

export async function findGuestByToken(
  eventId: string,
  qrToken: string,
): Promise<GuestData | null> {
  const q = query(
    collection(db, 'events', eventId, 'guests'),
    where('qrToken', '==', qrToken),
    limit(1),
  )
  const snapshot = await getDocs(q)
  if (snapshot.empty) return null
  const d = snapshot.docs[0]
  return mapGuest(d.id, d.data())
}

export async function setGuestRsvp(eventId: string, qrToken: string, rsvpStatus: RsvpStatus) {
  const guest = await findGuestByToken(eventId, qrToken)
  if (!guest) return
  await updateDoc(doc(db, 'events', eventId, 'guests', guest.id), { rsvpStatus })
}

export async function resetGuestRsvp(eventId: string, guestId: string) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { rsvpStatus: 'pending', lockToken: null })
}

// A diferencia de resetGuestRsvp, NO toca el RSVP — solo libera el pase para
// que pueda abrirse desde otro dispositivo (invitado que cambió de teléfono,
// borró el navegador, o lo abrió por error desde el dispositivo equivocado).
export async function unlockGuestPass(eventId: string, guestId: string) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { lockToken: null })
}

export async function setGuestPaymentStatus(
  eventId: string,
  guestId: string,
  paymentStatus: GuestPaymentStatus,
) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { paymentStatus })
}

/**
 * Claims the guest pass for a device. If no device has claimed it yet, locks it to
 * `deviceToken` and returns it. Otherwise returns the token of the device that
 * already claimed it (which may differ from `deviceToken`).
 */
export async function claimGuestPass(eventId: string, guestId: string, deviceToken: string): Promise<string> {
  const guestRef = doc(db, 'events', eventId, 'guests', guestId)
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(guestRef)
    if (!snap.exists()) return deviceToken
    const existing = (snap.data().lockToken as string) || null
    if (existing) return existing
    transaction.update(guestRef, { lockToken: deviceToken })
    return deviceToken
  })
}

async function findGuestRefByToken(eventId: string, qrToken: string) {
  const guests = collection(db, 'events', eventId, 'guests')
  const q = query(guests, where('qrToken', '==', qrToken), limit(1))
  const queryResult = await getDocs(q)
  if (queryResult.empty) return null
  return doc(db, 'events', eventId, 'guests', queryResult.docs[0].id)
}

export type CheckInResult =
  | { status: 'success'; guest: GuestData }
  | { status: 'already_checked_in'; guest: GuestData }
  | { status: 'payment_required'; guest: GuestData }
  | { status: 'not_found' }

export async function checkInGuest(
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
): Promise<CheckInResult> {
  const guestRef = await findGuestRefByToken(eventId, qrToken)
  if (!guestRef) {
    return { status: 'not_found' }
  }

  const eventRef = doc(db, 'events', eventId)

  return runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) {
      return { status: 'not_found' } as CheckInResult
    }
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    if (guest.status === 'checked_in') {
      return { status: 'already_checked_in', guest } as CheckInResult
    }

    const eventSnap = await transaction.get(eventRef)
    if (eventSnap.data()?.requiresPayment && guest.paymentStatus !== 'paid') {
      return { status: 'payment_required', guest } as CheckInResult
    }

    transaction.update(guestRef, {
      status: 'checked_in',
      checkedInAt: serverTimestamp(),
      checkedInBy: scannedBy,
      checkedInByEmail: scannedByEmail,
      checkedOutAt: null,
      checkedOutByEmail: null,
    })
    transaction.update(eventRef, { checkedInCount: increment(1) })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      type: 'check_in',
      timestamp: serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: { ...guest, status: 'checked_in' },
    } as CheckInResult
  })
}

export type CheckOutResult =
  | { status: 'success'; guest: GuestData }
  | { status: 'not_checked_in' }
  | { status: 'already_checked_out'; guest: GuestData }
  | { status: 'not_found' }

export async function checkOutGuest(
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
): Promise<CheckOutResult> {
  const guestRef = await findGuestRefByToken(eventId, qrToken)
  if (!guestRef) {
    return { status: 'not_found' }
  }

  return runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) {
      return { status: 'not_found' } as CheckOutResult
    }
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    if (guest.status !== 'checked_in') {
      return { status: 'not_checked_in' } as CheckOutResult
    }
    if (guest.checkedOutAt) {
      return { status: 'already_checked_out', guest } as CheckOutResult
    }

    transaction.update(guestRef, {
      checkedOutAt: serverTimestamp(),
      checkedOutByEmail: scannedByEmail,
    })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      type: 'check_out',
      timestamp: serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: { ...guest, checkedOutAt: Date.now() },
    } as CheckOutResult
  })
}

export interface CheckinSummaryEntry {
  name: string
  checkInTime: number
  status: 'checked_in'
}

// 12h con AM/PM (ej. "1:14 PM") para la tabla del resumen — reemplaza al
// formato 24h anterior (formatCheckinTime), que queda sin uso.
function formatCheckinTime12h(ms: number): string {
  const date = new Date(ms)
  const hours = date.getHours()
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12 // Convierte 0→12, 13→1, etc.
  return `${displayHours}:${minutes} ${period}`
}

/**
 * Resumen por email de los check-ins acumulados en la sesión actual del
 * dashboard del organizador (Prioridad 1 — "Email por check-in" reparado).
 * Totalmente desacoplada de checkInGuest()/checkOutGuest(): no las llama, no
 * depende de su resultado, y un fallo acá nunca revierte ni afecta un
 * check-in ya confirmado — son correos best-effort, por eso atrapan su
 * propio error y solo lo loguean.
 */
export async function sendCheckinSummary(
  eventId: string,
  organizerUid: string,
  checkinsData: CheckinSummaryEntry[],
): Promise<void> {
  if (checkinsData.length === 0) return
  try {
    const profile = await getUserProfile(organizerUid)
    if (!profile || profile.notifyOnCheckin !== true) return

    // Variable explícita (no `profile.email` inline) para que quede claro,
    // en una lectura rápida, exactamente qué valor llega a `to_email` — y
    // para poder loguear el caso "notifyOnCheckin activo pero sin email"
    // por separado de "no quiere recibir resumen". Si este log aparece en
    // producción, el problema es el perfil (sin email guardado); si NO
    // aparece y EmailJS igual responde 422, el problema es la plantilla de
    // EmailJS (su campo "To Email" no apunta a {{to_email}}), no este código.
    const organizerEmail = profile.email?.trim()
    if (!organizerEmail) {
      console.error('sendCheckinSummary: organizador sin email en su perfil, no se envía resumen.', { organizerUid })
      return
    }

    const event = await getEvent(eventId)
    if (!event) return

    const checkinsListHtml = checkinsData
      .map((c) => `${escapeHtml(c.name)} — ${formatCheckinTime12h(c.checkInTime)}`)
      .join('<br>')

    await sendCheckinSummaryEmail(organizerEmail, event.name, checkinsListHtml, checkinsData.length)
  } catch (err) {
    console.error('Error sending checkin summary:', err)
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Compatibilidad con invitados creados antes de este cambio, donde
// `companions` se guardaba como un número (cantidad) en vez de un array de
// datos por acompañante: se traduce a un array de ese largo sin datos, para
// que el resto de la app pueda seguir usando `companions.length` sin importar
// cuándo se creó el invitado.
function normalizeCompanions(value: unknown): CompanionData[] {
  if (Array.isArray(value)) {
    return value.map((c) => ({
      name: (c as CompanionData)?.name || '',
      lastName: (c as CompanionData)?.lastName || '',
      phone: (c as CompanionData)?.phone || '',
    }))
  }
  if (typeof value === 'number' && value > 0) {
    return Array.from({ length: value }, () => ({}))
  }
  return []
}

function mapGuest(id: string, data: Record<string, unknown>): GuestData {
  return {
    id,
    name: data.name as string,
    lastName: (data.lastName as string) || '',
    phone: (data.phone as string) || '',
    qrToken: data.qrToken as string,
    status: data.status as GuestData['status'],
    companions: normalizeCompanions(data.companions),
    rsvpStatus: (data.rsvpStatus as GuestData['rsvpStatus']) || 'pending',
    checkedInAt: toMillisOrNull(data.checkedInAt),
    checkedInBy: (data.checkedInBy as string) || null,
    checkedInByEmail: (data.checkedInByEmail as string) || null,
    checkedOutAt: toMillisOrNull(data.checkedOutAt),
    checkedOutByEmail: (data.checkedOutByEmail as string) || null,
    lockToken: (data.lockToken as string) || null,
    paymentStatus: (data.paymentStatus as GuestData['paymentStatus']) || 'unpaid',
    createdAt: toMillisOrNull(data.createdAt) || 0,
  }
}

function toMillisOrNull(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}
