import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from './config'
import type { EntryMode, EventData, EventStatus, PaymentStatus, Plan } from '../types'

export interface NewEventInput {
  name: string
  date: string
  location: string
  description?: string
  coverImage?: string
  accentColor?: string
  welcomeMessage?: string
  entryMode?: EntryMode
  capacity?: number
  plan: Plan
}

export async function createEvent(ownerId: string, input: NewEventInput) {
  const ref = await addDoc(collection(db, 'events'), {
    ownerId,
    name: input.name,
    date: input.date,
    location: input.location,
    description: input.description || '',
    coverImage: input.coverImage || '',
    accentColor: input.accentColor || '',
    welcomeMessage: input.welcomeMessage || '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity || null,
    plan: input.plan,
    paymentStatus: 'pending',
    status: 'active',
    guestCount: 0,
    checkedInCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

export function subscribeToUserEvents(
  ownerId: string,
  callback: (events: EventData[]) => void,
) {
  const q = query(
    collection(db, 'events'),
    where('ownerId', '==', ownerId),
    orderBy('createdAt', 'desc'),
  )
  return onSnapshot(q, (snapshot) => {
    const events = snapshot.docs.map((d) => mapEvent(d.id, d.data()))
    callback(events)
  })
}

export function subscribeToEvent(eventId: string, callback: (event: EventData | null) => void) {
  return onSnapshot(doc(db, 'events', eventId), (snapshot) => {
    if (!snapshot.exists()) {
      callback(null)
      return
    }
    callback(mapEvent(snapshot.id, snapshot.data()))
  })
}

export async function getEvent(eventId: string): Promise<EventData | null> {
  const snapshot = await getDoc(doc(db, 'events', eventId))
  if (!snapshot.exists()) return null
  return mapEvent(snapshot.id, snapshot.data())
}

export async function markEventPaid(eventId: string) {
  await updateDoc(doc(db, 'events', eventId), {
    paymentStatus: 'paid',
    updatedAt: serverTimestamp(),
  })
}

export async function setEventPaymentStatus(eventId: string, paymentStatus: PaymentStatus) {
  await updateDoc(doc(db, 'events', eventId), {
    paymentStatus,
    updatedAt: serverTimestamp(),
  })
}

export async function setEventStatus(eventId: string, status: EventStatus) {
  await updateDoc(doc(db, 'events', eventId), {
    status,
    updatedAt: serverTimestamp(),
  })
}

export interface UpdateEventInput {
  name: string
  date: string
  location: string
  description?: string
  coverImage?: string
  accentColor?: string
  welcomeMessage?: string
  entryMode?: EntryMode
  capacity?: number
}

export async function updateEventDetails(eventId: string, input: UpdateEventInput) {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    date: input.date,
    location: input.location,
    description: input.description || '',
    coverImage: input.coverImage ?? '',
    accentColor: input.accentColor ?? '',
    welcomeMessage: input.welcomeMessage ?? '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity || null,
    updatedAt: serverTimestamp(),
  })
}

export async function updateEventWelcomeMessage(eventId: string, welcomeMessage: string) {
  await updateDoc(doc(db, 'events', eventId), {
    welcomeMessage,
    updatedAt: serverTimestamp(),
  })
}

export async function updateEventBranding(
  eventId: string,
  branding: { accentColor?: string; logoUrl?: string },
) {
  await updateDoc(doc(db, 'events', eventId), {
    ...branding,
    updatedAt: serverTimestamp(),
  })
}

export async function deleteEvent(eventId: string) {
  const subcollections = ['guests', 'checkins']
  for (const sub of subcollections) {
    const snapshot = await getDocs(collection(db, 'events', eventId, sub))
    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db)
      for (const d of docs.slice(i, i + 450)) {
        batch.delete(d.ref)
      }
      await batch.commit()
    }
  }
  await deleteDoc(doc(db, 'events', eventId))
}

export function mapEvent(id: string, data: Record<string, unknown>): EventData {
  return {
    id,
    ownerId: data.ownerId as string,
    name: data.name as string,
    date: data.date as string,
    location: data.location as string,
    description: (data.description as string) || '',
    coverImage: (data.coverImage as string) || '',
    accentColor: (data.accentColor as string) || '',
    welcomeMessage: (data.welcomeMessage as string) || '',
    entryMode: (data.entryMode as EntryMode) || 'list',
    capacity: (data.capacity as number) || undefined,
    plan: data.plan as Plan,
    paymentStatus: data.paymentStatus as EventData['paymentStatus'],
    status: data.status as EventStatus,
    guestCount: (data.guestCount as number) || 0,
    checkedInCount: (data.checkedInCount as number) || 0,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
