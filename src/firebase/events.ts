import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
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
import type { CustomField, EntryMode, EventData, EventStatus, TemplateId } from '../types'

export interface NewEventInput {
  name: string
  date: string
  location: string
  description?: string
  coverImage?: string
  accentColor?: string
  templateId?: TemplateId
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity?: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
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
    templateId: input.templateId || 'default',
    welcomeMessage: input.welcomeMessage || '',
    mapsUrl: input.mapsUrl || '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity || null,
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency || '',
    paymentInstructions: input.paymentInstructions || '',
    // Premium gratis mientras se da a conocer el servicio — sin plan a elegir
    // ni pago que confirmar. Cuando se reintroduzcan pagos, esto vuelve a
    // depender de la elección del organizador.
    plan: 'premium',
    paymentStatus: 'paid',
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

export function subscribeToEvent(
  eventId: string,
  callback: (event: EventData | null) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    doc(db, 'events', eventId),
    (snapshot) => {
      if (!snapshot.exists()) {
        callback(null)
        return
      }
      callback(mapEvent(snapshot.id, snapshot.data()))
    },
    onError,
  )
}

export async function getEvent(eventId: string): Promise<EventData | null> {
  const snapshot = await getDoc(doc(db, 'events', eventId))
  if (!snapshot.exists()) return null
  return mapEvent(snapshot.id, snapshot.data())
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
  templateId?: TemplateId
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity?: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
}

export async function updateEventDetails(eventId: string, input: UpdateEventInput) {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    date: input.date,
    location: input.location,
    description: input.description || '',
    coverImage: input.coverImage ?? '',
    accentColor: input.accentColor ?? '',
    templateId: input.templateId || 'default',
    welcomeMessage: input.welcomeMessage ?? '',
    mapsUrl: input.mapsUrl ?? '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity || null,
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency ?? '',
    paymentInstructions: input.paymentInstructions ?? '',
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

export async function updateEventTemplate(eventId: string, templateId: TemplateId) {
  await updateDoc(doc(db, 'events', eventId), {
    templateId,
    updatedAt: serverTimestamp(),
  })
}

export async function addCoOrganizer(eventId: string, uid: string, email: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizersMap.${uid}`]: email,
    updatedAt: serverTimestamp(),
  })
}

export async function removeCoOrganizer(eventId: string, uid: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizersMap.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export async function deleteEvent(eventId: string) {
  const subcollections = ['guests', 'guestContacts', 'checkins', 'waitlist']
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
    templateId: (data.templateId as TemplateId) || 'default',
    welcomeMessage: (data.welcomeMessage as string) || '',
    mapsUrl: (data.mapsUrl as string) || '',
    entryMode: (data.entryMode as EntryMode) || 'list',
    capacity: (data.capacity as number) || undefined,
    customFields: (data.customFields as CustomField[]) || [],
    requiresPayment: (data.requiresPayment as boolean) || false,
    ticketPrice: (data.ticketPrice as number) || 0,
    currency: (data.currency as string) || '',
    paymentInstructions: (data.paymentInstructions as string) || '',
    plan: data.plan as EventData['plan'],
    paymentStatus: data.paymentStatus as EventData['paymentStatus'],
    status: data.status as EventStatus,
    guestCount: (data.guestCount as number) || 0,
    checkedInCount: (data.checkedInCount as number) || 0,
    coOrganizersMap: (data.coOrganizersMap as Record<string, string>) || {},
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
