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
import type { GuestData, GuestPaymentStatus, RsvpStatus } from '../types'

export interface NewGuestInput {
  name: string
  email?: string
  phone?: string
  companions?: number
}

function generateQrToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

export async function addGuest(eventId: string, input: NewGuestInput) {
  const batch = writeBatch(db)
  const guestRef = doc(collection(db, 'events', eventId, 'guests'))
  batch.set(guestRef, {
    name: input.name,
    email: input.email || '',
    phone: input.phone || '',
    companions: input.companions || 0,
    rsvpStatus: 'pending',
    qrToken: generateQrToken(),
    status: 'invited',
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    lockToken: null,
    paymentStatus: 'unpaid',
    createdAt: serverTimestamp(),
  })
  batch.update(doc(db, 'events', eventId), { guestCount: increment(1) })
  await batch.commit()
  return guestRef.id
}

export async function addGuestsBulk(eventId: string, names: string[]) {
  const batch = writeBatch(db)
  for (const name of names) {
    const guestRef = doc(collection(db, 'events', eventId, 'guests'))
    batch.set(guestRef, {
      name,
      email: '',
      phone: '',
      companions: 0,
      rsvpStatus: 'pending',
      qrToken: generateQrToken(),
      status: 'invited',
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      lockToken: null,
      paymentStatus: 'unpaid',
      createdAt: serverTimestamp(),
    })
  }
  batch.update(doc(db, 'events', eventId), { guestCount: increment(names.length) })
  await batch.commit()
}

export interface UpdateGuestInput {
  name?: string
  email?: string
  phone?: string
  companions?: number
}

export async function updateGuest(eventId: string, guestId: string, input: UpdateGuestInput) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { ...input })
}

export async function deleteGuest(eventId: string, guestId: string, wasCheckedIn: boolean) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'events', eventId, 'guests', guestId))
  const updates: Record<string, unknown> = { guestCount: increment(-1) }
  if (wasCheckedIn) {
    updates.checkedInCount = increment(-1)
  }
  batch.update(doc(db, 'events', eventId), updates)
  await batch.commit()
}

export function subscribeToGuests(eventId: string, callback: (guests: GuestData[]) => void) {
  const q = query(collection(db, 'events', eventId, 'guests'), orderBy('createdAt', 'asc'))
  return onSnapshot(q, (snapshot) => {
    const guests = snapshot.docs.map((d) => mapGuest(d.id, d.data()))
    callback(guests)
  })
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

function mapGuest(id: string, data: Record<string, unknown>): GuestData {
  return {
    id,
    name: data.name as string,
    email: (data.email as string) || '',
    phone: (data.phone as string) || '',
    qrToken: data.qrToken as string,
    status: data.status as GuestData['status'],
    companions: (data.companions as number) || 0,
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
