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
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import type { CustomField, EntryMode, EventData, EventStatus, TemplateId, TimelineEntry } from '../types'
import { EventSchema, warnIfInvalidShape } from '../types/schemas'

export interface NewEventInput {
  name: string
  date: string
  startTime?: string
  endTime?: string
  location: string
  description?: string
  dressCode?: string
  coverImage?: string
  accentColor?: string
  templateId?: TemplateId
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
  timeline?: TimelineEntry[]
}

export async function createEvent(ownerId: string, input: NewEventInput) {
  const ref = await addDoc(collection(db, 'events'), {
    ownerId,
    name: input.name,
    date: input.date,
    startTime: input.startTime || '',
    endTime: input.endTime || '',
    location: input.location,
    description: input.description || '',
    dressCode: input.dressCode || '',
    coverImage: input.coverImage || '',
    accentColor: input.accentColor || '',
    templateId: input.templateId || 'default',
    welcomeMessage: input.welcomeMessage || '',
    mapsUrl: input.mapsUrl || '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity,
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency || '',
    paymentInstructions: input.paymentInstructions || '',
    timeline: input.timeline || [],
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
): Unsubscribe {
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
): Unsubscribe {
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
  startTime?: string
  endTime?: string
  location: string
  description?: string
  dressCode?: string
  coverImage?: string
  accentColor?: string
  templateId?: TemplateId
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
  timeline?: TimelineEntry[]
}

export async function updateEventDetails(eventId: string, input: UpdateEventInput) {
  await updateDoc(doc(db, 'events', eventId), {
    name: input.name,
    date: input.date,
    startTime: input.startTime || '',
    endTime: input.endTime || '',
    location: input.location,
    description: input.description || '',
    dressCode: input.dressCode || '',
    coverImage: input.coverImage ?? '',
    accentColor: input.accentColor ?? '',
    templateId: input.templateId || 'default',
    welcomeMessage: input.welcomeMessage ?? '',
    mapsUrl: input.mapsUrl ?? '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity,
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency ?? '',
    paymentInstructions: input.paymentInstructions ?? '',
    timeline: input.timeline || [],
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

// Antes: 4 subcolecciones leídas y borradas UNA A LA VEZ (cada `await` en el
// loop esperaba a la anterior sin necesidad — no hay ninguna dependencia
// entre guests/guestContacts/checkins/waitlist). Con un evento de varios
// cientos de invitados/check-ins, eso significa varios round-trips
// secuenciales sumados antes de poder borrar el documento del evento. Ahora
// las 4 lecturas van en paralelo, y todos los chunks de borrado (de las 4
// colecciones juntas) también — cada `batch.commit()` es independiente del
// resto, no hay razón para esperarlos de a uno.
export async function deleteEvent(eventId: string) {
  const subcollections = ['guests', 'guestContacts', 'checkins', 'waitlist']
  const snapshots = await Promise.all(
    subcollections.map((sub) => getDocs(collection(db, 'events', eventId, sub))),
  )

  const commits: Promise<void>[] = []
  for (const snapshot of snapshots) {
    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += 450) {
      const batch = writeBatch(db)
      for (const d of docs.slice(i, i + 450)) {
        batch.delete(d.ref)
      }
      commits.push(batch.commit())
    }
  }
  await Promise.all(commits)
  await deleteDoc(doc(db, 'events', eventId))
}

// ownerId/name/date/location/plan/paymentStatus/status se castean sin
// fallback (a diferencia del resto de campos, que sí tienen `|| valor` por
// defecto). Hoy no es un bug porque createEvent() siempre los escribe y nada
// los borra — el riesgo es ante un documento editado a mano o una migración
// de esquema futura. No se le agregó un fallback mecánico: inventar un valor
// (ej. status por defecto) sería una decisión de producto, no un fix de
// tipos, y para campos como ownerId enmascararía un documento corrupto en
// vez de hacerlo visible. En su lugar, `warnIfInvalidShape` valida la forma
// final con Zod y loguea un error claro si algo no calza — sin cambiar el
// valor devuelto ni el tipo de retorno de esta función.
export function mapEvent(id: string, data: Record<string, unknown>): EventData {
  const event: EventData = {
    id,
    ownerId: data.ownerId as string,
    name: data.name as string,
    date: data.date as string,
    startTime: (data.startTime as string) || '',
    endTime: (data.endTime as string) || '',
    location: data.location as string,
    description: (data.description as string) || '',
    dressCode: (data.dressCode as string) || undefined,
    coverImage: (data.coverImage as string) || '',
    accentColor: (data.accentColor as string) || '',
    templateId: (data.templateId as TemplateId) || 'default',
    welcomeMessage: (data.welcomeMessage as string) || '',
    mapsUrl: (data.mapsUrl as string) || '',
    entryMode: (data.entryMode as EntryMode) || 'list',
    capacity: (data.capacity as number) || 0,
    customFields: (data.customFields as CustomField[]) || [],
    requiresPayment: (data.requiresPayment as boolean) || false,
    ticketPrice: (data.ticketPrice as number) || 0,
    currency: (data.currency as string) || '',
    paymentInstructions: (data.paymentInstructions as string) || '',
    timeline: (data.timeline as TimelineEntry[]) || [],
    plan: data.plan as EventData['plan'],
    paymentStatus: data.paymentStatus as EventData['paymentStatus'],
    status: data.status as EventStatus,
    guestCount: (data.guestCount as number) || 0,
    checkedInCount: (data.checkedInCount as number) || 0,
    coOrganizersMap: (data.coOrganizersMap as Record<string, string>) || {},
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
  warnIfInvalidShape(EventSchema, 'Event', event)
  return event
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
