import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import { compareEventsByRelevance } from '../utils/time'
import type { CustomField, EntryMode, EventData, EventStatus, PaymentMethod, TemplateId, TimelineEntry } from '../types'
import { EventSchema, warnIfInvalidShape } from '../types/schemas'
import { LEGACY_COORG_DEFAULTS, type CoOrganizerPermissions } from '../types/coOrganizerPermissions'

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
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
  organizerContactPhone?: string
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
    paymentMethods: input.requiresPayment ? input.paymentMethods || [] : [],
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency || '',
    paymentInstructions: input.paymentInstructions || '',
    organizerContactPhone: input.organizerContactPhone?.trim() || '',
    timeline: input.timeline || [],
    // Premium gratis mientras se da a conocer el servicio — sin plan a elegir
    // ni pago que confirmar. Cuando se reintroduzcan pagos, esto vuelve a
    // depender de la elección del organizador.
    plan: 'premium',
    paymentStatus: 'paid',
    status: 'active',
    guestCount: 0,
    peopleCount: 0,
    checkedInCount: 0,
    occupancyCount: 0,
    paidCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  return ref.id
}

// "Mis eventos" tiene que incluir tanto los eventos propios como aquellos
// donde el usuario es co-organizador (coOrganizersMap, ver addCoOrganizer) —
// antes solo filtraba por ownerId, así que un co-anfitrión agregado nunca
// veía el evento en su propio menú aunque sí tuviera acceso de edición vía
// firestore.rules. Dos listeners separados (Firestore no permite un OR entre
// un campo simple y una key de mapa en la misma query) fusionados por id, sin
// orderBy en ninguno de los dos para no requerir un índice compuesto — el
// orden final (por fecha/hora del evento, no por creación, ver
// compareEventsByRelevance) se resuelve acá, sobre la lista ya combinada.
export function subscribeToUserEvents(
  uid: string,
  callback: (events: EventData[]) => void,
): Unsubscribe {
  let owned: EventData[] | null = null
  let coOrganized: EventData[] | null = null

  function emitIfReady() {
    if (owned === null || coOrganized === null) return
    const merged = new Map<string, EventData>()
    for (const ev of owned) merged.set(ev.id, ev)
    for (const ev of coOrganized) merged.set(ev.id, ev)
    callback(Array.from(merged.values()).sort(compareEventsByRelevance))
  }

  const ownedQuery = query(collection(db, 'events'), where('ownerId', '==', uid))
  const unsubOwned = onSnapshot(ownedQuery, (snapshot) => {
    owned = snapshot.docs.map((d) => mapEvent(d.id, d.data()))
    emitIfReady()
  }, withListenerReporting('userEvents.owned'))

  const coOrgQuery = query(collection(db, 'events'), where(`coOrganizersMap.${uid}`, '!=', null))
  const unsubCoOrganized = onSnapshot(coOrgQuery, (snapshot) => {
    coOrganized = snapshot.docs.map((d) => mapEvent(d.id, d.data()))
    emitIfReady()
  }, withListenerReporting('userEvents.coOrganized'))

  return () => {
    unsubOwned()
    unsubCoOrganized()
  }
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
    withListenerReporting('event', onError),
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
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  paymentInstructions?: string
  organizerContactPhone?: string
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
    paymentMethods: input.requiresPayment ? input.paymentMethods || [] : [],
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency ?? '',
    paymentInstructions: input.paymentInstructions ?? '',
    organizerContactPhone: input.organizerContactPhone?.trim() ?? '',
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

// `permissions` por defecto LEGACY_COORG_DEFAULTS: agregar un co-organizador
// sigue siendo un flujo de un solo paso (email + botón) — quien quiera
// otorgar un set distinto lo ajusta después con updateCoOrganizerPermissions.
export async function addCoOrganizer(
  eventId: string,
  uid: string,
  email: string,
  permissions: CoOrganizerPermissions = LEGACY_COORG_DEFAULTS,
) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizersMap.${uid}`]: email,
    [`coOrganizerPermissions.${uid}`]: permissions,
    updatedAt: serverTimestamp(),
  })
}

// Usado por el dueño (o un co-organizador con manageCoOrganizers) para quitar
// a OTRO co-organizador. Para que un co-organizador se quite a sí mismo, ver
// leaveCoOrganizer — misma escritura, pero autorizada por una rama distinta
// de firestore.rules (el propio uid, no el de un tercero).
export async function removeCoOrganizer(eventId: string, uid: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizersMap.${uid}`]: deleteField(),
    [`coOrganizerPermissions.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// El propio co-organizador abandona el evento ("Salir del evento"). No
// afecta invitados, pagos, ni al organizador principal — borra únicamente su
// propia entrada en los dos mapas del evento.
export async function leaveCoOrganizer(eventId: string, uid: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizersMap.${uid}`]: deleteField(),
    [`coOrganizerPermissions.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export async function updateCoOrganizerPermissions(
  eventId: string,
  uid: string,
  permissions: CoOrganizerPermissions,
) {
  await updateDoc(doc(db, 'events', eventId), {
    [`coOrganizerPermissions.${uid}`]: permissions,
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
  // 'waitlist' listada acá hasta hace poco: la funcionalidad de espera de
  // cupo se eliminó (ver src/firebase/waitlist.ts, borrado) y
  // firestore.rules bloquea esa colección con `allow read, write: if
  // false` sin excepción — ni siquiera el dueño puede leerla. Un
  // `getDocs()` contra ella (como hacía este Promise.all) rechaza con
  // permission-denied SIEMPRE, lo que tumbaba TODO deleteEvent antes de
  // borrar nada, ni siquiera el documento del evento — no era "quedan
  // fotos huérfanas", era "no se puede eliminar ningún evento". 'photos' y
  // 'wall' sí son subcolecciones activas (fotos del muro y mensajes) que
  // antes quedaban huérfanas silenciosamente al "eliminar" un evento.
  const subcollections = ['guests', 'guestContacts', 'checkins', 'photos', 'wall']
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
    // Eventos creados antes de este campo (con requiresPayment ya activado)
    // solo tenían transferencia — se lo asignamos acá para no dejarlos sin
    // ningún método configurado. `data.requiresPayment` (no el campo ya
    // mapeado arriba) porque `paymentMethods` no depende de él, es un default
    // sobre datos crudos de Firestore, igual que el resto de este mapper.
    paymentMethods: (data.paymentMethods as EventData['paymentMethods'])
      || (data.requiresPayment ? ['transfer'] : []),
    ticketPrice: (data.ticketPrice as number) || 0,
    currency: (data.currency as string) || '',
    paymentInstructions: (data.paymentInstructions as string) || '',
    organizerContactPhone: (data.organizerContactPhone as string) || '',
    timeline: (data.timeline as TimelineEntry[]) || [],
    plan: data.plan as EventData['plan'],
    paymentStatus: data.paymentStatus as EventData['paymentStatus'],
    status: data.status as EventStatus,
    guestCount: (data.guestCount as number) || 0,
    // Eventos creados antes de este campo no lo tienen — cae a guestCount
    // (no a 0) porque en esos eventos, anteriores a acompañantes/familias,
    // cada invitación equivale exactamente a una persona. Caer a 0 rompía el
    // "% de asistencia" (mostraba 0% con checkedInCount > 0) en cualquier
    // evento viejo que no hubiera tenido un alta/edición de invitado desde
    // que se agregó este campo. Ver comentario de `peopleCount` en types/index.ts.
    peopleCount: typeof data.peopleCount === 'number' ? data.peopleCount : (data.guestCount as number) || 0,
    checkedInCount: (data.checkedInCount as number) || 0,
    occupancyCount: (data.occupancyCount as number) || 0,
    // Eventos creados antes de este campo caen a 0 — ver
    // scripts/backfill-paid-count.mjs para recalcularlo a partir de guests
    // ya pagados si hace falta reflejarlo de inmediato.
    paidCount: (data.paidCount as number) || 0,
    coOrganizersMap: (data.coOrganizersMap as Record<string, string>) || {},
    coOrganizerPermissions: data.coOrganizerPermissions as EventData['coOrganizerPermissions'],
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
