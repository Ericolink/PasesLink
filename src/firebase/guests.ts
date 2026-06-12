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
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './config'
import type { GuestData } from '../types'

export interface NewGuestInput {
  name: string
  email?: string
  phone?: string
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
    qrToken: generateQrToken(),
    status: 'invited',
    checkedInAt: null,
    checkedInBy: null,
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
      qrToken: generateQrToken(),
      status: 'invited',
      checkedInAt: null,
      checkedInBy: null,
      createdAt: serverTimestamp(),
    })
  }
  batch.update(doc(db, 'events', eventId), { guestCount: increment(names.length) })
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

export type CheckInResult =
  | { status: 'success'; guest: GuestData }
  | { status: 'already_checked_in'; guest: GuestData }
  | { status: 'not_found' }

export async function checkInGuest(
  eventId: string,
  qrToken: string,
  scannedBy: string,
): Promise<CheckInResult> {
  const guests = collection(db, 'events', eventId, 'guests')
  const q = query(guests, where('qrToken', '==', qrToken), limit(1))
  const queryResult = await getDocs(q)
  const snapshot = queryResult.empty ? null : mapGuest(queryResult.docs[0].id, queryResult.docs[0].data())

  if (!snapshot) {
    return { status: 'not_found' }
  }

  const guestRef = doc(db, 'events', eventId, 'guests', snapshot.id)
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

    transaction.update(guestRef, {
      status: 'checked_in',
      checkedInAt: serverTimestamp(),
      checkedInBy: scannedBy,
    })
    transaction.update(eventRef, { checkedInCount: increment(1) })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      timestamp: serverTimestamp(),
      scannedBy,
    })

    return {
      status: 'success',
      guest: { ...guest, status: 'checked_in' },
    } as CheckInResult
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
    checkedInAt: toMillisOrNull(data.checkedInAt),
    checkedInBy: (data.checkedInBy as string) || null,
    createdAt: toMillisOrNull(data.createdAt) || 0,
  }
}

function toMillisOrNull(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}
