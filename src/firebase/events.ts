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
import type { QueryDocumentSnapshot, Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import { compareEventsByRelevance } from '../utils/time'
import { GUEST_MAX_COMPANIONS } from '../utils/validation'
import type { CommunityTemplateSnapshot, CustomField, DietaryRestriction, EntryMode, EventData, EventStatus, FaqEntry, GiftInfo, GuestSegmentTag, MenuOption, PaymentMethod, ReminderRule, TemplateId, ThemeOverrides, TimelineEntry, TransportInfo, VisibilitySection } from '../types'

// Clampea a [0, GUEST_MAX_COMPANIONS] — defensa además de la validación de
// UI (EventCreate/EditEventForm) y de firestore.rules (isValidMaxCompanions).
function clampMaxCompanions(value: number | undefined): number {
  return Math.min(Math.max(Math.trunc(value ?? 0), 0), GUEST_MAX_COMPANIONS)
}
import { EventSchema, warnIfInvalidShape } from '../types/schemas'
import type { CoOrganizerPermissions } from '../types/coOrganizerPermissions'
import type { ConcessionsConfig } from '../types/concessions'
import type { CollaboratorEntry } from '../types/collaboratorPermissions'

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
  themeOverrides?: ThemeOverrides
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity: number
  attendeeLimitEnabled?: boolean
  maxCompanions?: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  transferBankName?: string
  transferAccountHolder?: string
  transferAccountNumber?: string
  transferReference?: string
  cashInstructions?: string
  paymentInstructions?: string
  organizerContactPhone?: string
  organizerContactPhoneCountry?: string
  timeline?: TimelineEntry[]
  faq?: FaqEntry[]
  transport?: TransportInfo
  rsvpDeadline?: string
  remindersEnabled?: boolean
  reminderRules?: ReminderRule[]
  guestTags?: GuestSegmentTag[]
  vipTagId?: string | null
  sectionVisibility?: EventData['sectionVisibility']
  sections?: VisibilitySection[]
  menu?: { options: MenuOption[]; restrictions: DietaryRestriction[] }
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
    themeOverrides: input.themeOverrides || {},
    welcomeMessage: input.welcomeMessage || '',
    mapsUrl: input.mapsUrl || '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity,
    attendeeLimitEnabled: input.attendeeLimitEnabled || false,
    maxCompanions: clampMaxCompanions(input.maxCompanions),
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    paymentMethods: input.requiresPayment ? input.paymentMethods || [] : [],
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency || '',
    transferBankName: input.transferBankName?.trim() || '',
    transferAccountHolder: input.transferAccountHolder?.trim() || '',
    transferAccountNumber: input.transferAccountNumber?.trim() || '',
    transferReference: input.transferReference?.trim() || '',
    cashInstructions: input.cashInstructions?.trim() || '',
    paymentInstructions: input.paymentInstructions || '',
    organizerContactPhone: input.organizerContactPhone?.trim() || '',
    organizerContactPhoneCountry: input.organizerContactPhoneCountry || '',
    timeline: input.timeline || [],
    faq: input.faq || [],
    transport: input.transport || {},
    rsvpDeadline: input.rsvpDeadline || '',
    remindersEnabled: input.remindersEnabled || false,
    reminderRules: input.reminderRules || [],
    guestTags: input.guestTags || [],
    vipTagId: input.vipTagId ?? null,
    sectionVisibility: input.sectionVisibility || {},
    sections: input.sections || [],
    menu: input.menu || { options: [], restrictions: [] },
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
    walkInNetCount: 0,
    paidCount: 0,
    checkinsByHour: {},
    rsvpYesCount: 0,
    rsvpNoCount: 0,
    rsvpPendingCount: 0,
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
  // Colaboradores del sistema unificado (ROLES_PERMISSIONS_REDESIGN.md Fase 4)
  // — antes de este listener, un colaborador de rol angosto (recepción/caja/
  // ventas/preparación) invitado vía event.collaborators no aparecía acá en
  // absoluto: su único camino de vuelta al evento era reabrir el enlace/QR de
  // invitación original. Bug real, no solo carencia de diseño.
  let collaborating: EventData[] | null = null

  function emitIfReady() {
    if (owned === null || coOrganized === null || collaborating === null) return
    const merged = new Map<string, EventData>()
    for (const ev of owned) merged.set(ev.id, ev)
    for (const ev of coOrganized) merged.set(ev.id, ev)
    for (const ev of collaborating) merged.set(ev.id, ev)
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

  const collaboratorQuery = query(collection(db, 'events'), where(`collaborators.${uid}`, '!=', null))
  const unsubCollaborating = onSnapshot(collaboratorQuery, (snapshot) => {
    collaborating = snapshot.docs.map((d) => mapEvent(d.id, d.data()))
    emitIfReady()
  }, withListenerReporting('userEvents.collaborating'))

  return () => {
    unsubOwned()
    unsubCoOrganized()
    unsubCollaborating()
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

// Para pantallas que hasta ahora hacían un getEvent() puntual para decidir su
// estado inicial (not_found/error/listo) Y ADEMÁS abrían un subscribeToEvent
// aparte para mantenerse al día (GuestPass/EventJoin/EventArrive) — eso lee
// el mismo documento dos veces en cada visita. Esta función abre un único
// listener y expone además una promesa que resuelve con su PRIMER snapshot,
// para que el bootstrap de la pantalla pueda esperar por ese dato sin pagar
// una lectura getDoc de más. `callback` sigue recibiendo cada snapshot
// (incluido el primero), igual que subscribeToEvent.
export function subscribeToEventWithInitial(
  eventId: string,
  callback: (event: EventData | null) => void,
  onError?: (error: Error) => void,
): { unsubscribe: Unsubscribe; initial: Promise<EventData | null> } {
  let resolveInitial!: (event: EventData | null) => void
  let rejectInitial!: (error: Error) => void
  const initial = new Promise<EventData | null>((resolve, reject) => {
    resolveInitial = resolve
    rejectInitial = reject
  })
  let settled = false
  const unsubscribe = subscribeToEvent(
    eventId,
    (event) => {
      callback(event)
      if (!settled) {
        settled = true
        resolveInitial(event)
      }
    },
    (error) => {
      // Si el listener falla antes de entregar ningún snapshot (p.ej.
      // permission-denied), `initial` debe rechazar para que el bootstrap de
      // la pantalla caiga en su catch() y muestre error en vez de quedarse
      // cargando para siempre esperando una promesa que ya no va a resolver.
      if (!settled) {
        settled = true
        rejectInitial(error)
      }
      onError?.(error)
    },
  )
  return { unsubscribe, initial }
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
  themeOverrides?: ThemeOverrides
  welcomeMessage?: string
  mapsUrl?: string
  entryMode?: EntryMode
  capacity: number
  attendeeLimitEnabled?: boolean
  maxCompanions?: number
  customFields?: CustomField[]
  requiresPayment?: boolean
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  transferBankName?: string
  transferAccountHolder?: string
  transferAccountNumber?: string
  transferReference?: string
  cashInstructions?: string
  paymentInstructions?: string
  organizerContactPhone?: string
  organizerContactPhoneCountry?: string
  timeline?: TimelineEntry[]
  faq?: FaqEntry[]
  transport?: TransportInfo
  rsvpDeadline?: string
  remindersEnabled?: boolean
  reminderRules?: ReminderRule[]
  guestTags?: GuestSegmentTag[]
  vipTagId?: string | null
  sectionVisibility?: EventData['sectionVisibility']
  sections?: VisibilitySection[]
  menu?: { options: MenuOption[]; restrictions: DietaryRestriction[] }
  gifts?: GiftInfo
  departureReminderBufferMinutes?: number
  communityTemplateSnapshot?: CommunityTemplateSnapshot | null
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
    themeOverrides: input.themeOverrides || {},
    welcomeMessage: input.welcomeMessage ?? '',
    mapsUrl: input.mapsUrl ?? '',
    entryMode: input.entryMode || 'list',
    capacity: input.capacity,
    attendeeLimitEnabled: input.attendeeLimitEnabled || false,
    maxCompanions: clampMaxCompanions(input.maxCompanions),
    customFields: input.customFields || [],
    requiresPayment: input.requiresPayment || false,
    paymentMethods: input.requiresPayment ? input.paymentMethods || [] : [],
    ticketPrice: input.ticketPrice || 0,
    currency: input.currency ?? '',
    transferBankName: input.transferBankName?.trim() ?? '',
    transferAccountHolder: input.transferAccountHolder?.trim() ?? '',
    transferAccountNumber: input.transferAccountNumber?.trim() ?? '',
    transferReference: input.transferReference?.trim() ?? '',
    cashInstructions: input.cashInstructions?.trim() ?? '',
    paymentInstructions: input.paymentInstructions ?? '',
    organizerContactPhone: input.organizerContactPhone?.trim() ?? '',
    organizerContactPhoneCountry: input.organizerContactPhoneCountry ?? '',
    timeline: input.timeline || [],
    faq: input.faq || [],
    transport: input.transport || {},
    rsvpDeadline: input.rsvpDeadline || '',
    remindersEnabled: input.remindersEnabled || false,
    reminderRules: input.reminderRules || [],
    guestTags: input.guestTags || [],
    vipTagId: input.vipTagId ?? null,
    sectionVisibility: input.sectionVisibility || {},
    sections: input.sections || [],
    menu: input.menu || { options: [], restrictions: [] },
    gifts: input.gifts || {},
    departureReminderBufferMinutes: input.departureReminderBufferMinutes ?? 15,
    communityTemplateSnapshot: input.communityTemplateSnapshot ?? null,
    updatedAt: serverTimestamp(),
  })
}

// Write mínimo de capacity/attendeeLimitEnabled — a diferencia de
// updateEventDetails (que siempre reescribe los ~35 campos editables del
// formulario), esta función toca SOLO esos dos campos. La usa el flujo de
// degradación a lista de espera de EditEventForm.tsx: primero para apagar
// attendeeLimitEnabled (evita que onCapacityFreed dispare su cascada
// mientras se mueve gente a la waitlist) y después para reactivarlo con la
// capacidad ya ajustada — ninguno de los dos pasos puede esperar a que el
// organizador confirme el resto de los cambios del formulario, así que no
// puede pasar por updateEventDetails sin arriesgar guardar edits a medio
// hacer del resto del form.
export async function setEventCapacityLimit(
  eventId: string,
  input: { capacity: number; attendeeLimitEnabled: boolean },
): Promise<void> {
  await updateDoc(doc(db, 'events', eventId), input)
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

// Equivalentes de removeCoOrganizer/leaveCoOrganizer para el sistema
// unificado de colaboradores (ROLES_PERMISSIONS_REDESIGN.md Fase 4) — un
// solo campo por uid (`collaborators.${uid}`), no dos mapas.
export async function removeCollaborator(eventId: string, uid: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`collaborators.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

export async function leaveCollaborator(eventId: string, uid: string) {
  await updateDoc(doc(db, 'events', eventId), {
    [`collaborators.${uid}`]: deleteField(),
    updatedAt: serverTimestamp(),
  })
}

// Cantidad de batch.commit() en vuelo a la vez al borrar un evento (ver
// deleteEvent). 6 conserva la mayor parte del beneficio de paralelizar
// (mucho más rápido que uno por uno) sin disparar decenas/cientos de
// commits simultáneos en un evento con muchos miles de documentos — ver
// comentario dentro de deleteEvent.
const DELETE_BATCH_CONCURRENCY = 6

// Antes: 4 subcolecciones leídas y borradas UNA A LA VEZ (cada `await` en el
// loop esperaba a la anterior sin necesidad — no hay ninguna dependencia
// entre guests/guestContacts/checkins/waitlist). Con un evento de varios
// cientos de invitados/check-ins, eso significa varios round-trips
// secuenciales sumados antes de poder borrar el documento del evento. Ahora
// las 4 lecturas van en paralelo, y los chunks de borrado (de las 4
// colecciones juntas) se procesan con un pool acotado (ver
// DELETE_BATCH_CONCURRENCY): un evento de decenas de miles de documentos
// puede repartirse en decenas de batches de 450, y lanzarlos TODOS de una
// (Promise.all directo sobre cada commit) satura la conexión del cliente sin
// necesidad — el pool mantiene varios commits en vuelo sin ese pico.
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

  const docChunks: QueryDocumentSnapshot[][] = []
  for (const snapshot of snapshots) {
    const docs = snapshot.docs
    for (let i = 0; i < docs.length; i += 450) {
      docChunks.push(docs.slice(i, i + 450))
    }
  }

  let nextChunk = 0
  async function commitWorker() {
    while (nextChunk < docChunks.length) {
      const chunk = docChunks[nextChunk++]
      const batch = writeBatch(db)
      for (const d of chunk) batch.delete(d.ref)
      await batch.commit()
    }
  }
  const workerCount = Math.min(DELETE_BATCH_CONCURRENCY, docChunks.length)
  await Promise.all(Array.from({ length: workerCount }, commitWorker))

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
    themeOverrides: (data.themeOverrides as ThemeOverrides) || undefined,
    welcomeMessage: (data.welcomeMessage as string) || '',
    mapsUrl: (data.mapsUrl as string) || '',
    entryMode: (data.entryMode as EntryMode) || 'list',
    capacity: (data.capacity as number) || 0,
    // Ausente/false en eventos anteriores a este campo (o que nunca lo
    // activaron): cupo ilimitado, comportamiento de siempre — ver
    // CAPACITY_LIMIT_ARCHITECTURE.md.
    attendeeLimitEnabled: (data.attendeeLimitEnabled as boolean) || false,
    // Sin default a 0 acá (a diferencia de la mayoría de campos de este
    // mapper): "ausente" (evento de antes de este campo) y "0 explícito"
    // deben distinguirse solo si algún día hace falta — hoy da lo mismo,
    // porque resolveMaxCompanions (firebase/guests.ts) trata ambos como 0.
    maxCompanions: typeof data.maxCompanions === 'number' ? data.maxCompanions : undefined,
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
    transferBankName: (data.transferBankName as string) || '',
    transferAccountHolder: (data.transferAccountHolder as string) || '',
    transferAccountNumber: (data.transferAccountNumber as string) || '',
    transferReference: (data.transferReference as string) || '',
    cashInstructions: (data.cashInstructions as string) || '',
    paymentInstructions: (data.paymentInstructions as string) || '',
    organizerContactPhone: (data.organizerContactPhone as string) || '',
    organizerContactPhoneCountry: (data.organizerContactPhoneCountry as string) || '',
    timeline: (data.timeline as TimelineEntry[]) || [],
    faq: (data.faq as FaqEntry[]) || [],
    transport: (data.transport as TransportInfo) || undefined,
    rsvpDeadline: (data.rsvpDeadline as string) || undefined,
    remindersEnabled: (data.remindersEnabled as boolean) || false,
    reminderRules: (data.reminderRules as ReminderRule[]) || [],
    guestTags: (data.guestTags as GuestSegmentTag[]) || [],
    vipTagId: (data.vipTagId as string) || null,
    sectionVisibility: (data.sectionVisibility as EventData['sectionVisibility']) || undefined,
    departureReminderBufferMinutes: typeof data.departureReminderBufferMinutes === 'number' ? data.departureReminderBufferMinutes : undefined,
    communityTemplateSnapshot: (data.communityTemplateSnapshot as CommunityTemplateSnapshot) || undefined,
    sections: (data.sections as VisibilitySection[]) || [],
    menu: (data.menu as EventData['menu']) || undefined,
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
    walkInNetCount: (data.walkInNetCount as number) || 0,
    // Eventos creados antes de este campo caen a 0 — se autocorrige solo vía
    // reconcileGuestCounters/reconcileDirtyGuestCounters (functions/src/
    // reconciliation/reconcileGuestCounters.ts).
    paidCount: (data.paidCount as number) || 0,
    // Eventos con check-ins de antes de este campo caen a {} — ver
    // scripts/backfill-checkins-by-hour.mjs.
    checkinsByHour: (data.checkinsByHour as Record<string, number>) || {},
    // Eventos con invitados de antes de estos campos caen a 0 — se
    // autocorrige solo, mismo mecanismo que paidCount arriba.
    rsvpYesCount: (data.rsvpYesCount as number) || 0,
    rsvpNoCount: (data.rsvpNoCount as number) || 0,
    rsvpPendingCount: (data.rsvpPendingCount as number) || 0,
    coOrganizersMap: (data.coOrganizersMap as Record<string, string>) || {},
    coOrganizerPermissions: data.coOrganizerPermissions as EventData['coOrganizerPermissions'],
    // Bug real (2026-08-13): este campo se agregó a EventData en la Fase 1
    // del rediseño de roles/permisos, pero nunca se sumó acá — mapEvent()
    // construye un objeto nuevo campo por campo (no un spread de `data`), así
    // que TODO el sistema de collaborators quedaba invisible para cualquier
    // pantalla que leyera el evento por la vía normal (subscribeToEvent/
    // getEvent), aunque el documento crudo de Firestore sí lo tuviera y las
    // reglas/Cloud Functions ya lo resolvieran bien. `invitedAt` puede venir
    // como Timestamp real (Cloud Function, FieldValue.serverTimestamp()) o
    // como number (scripts/backfill-collaborators-from-legacy.mjs, que usa
    // Date.now()) — se normaliza acá, mismo criterio que createdAt/updatedAt.
    collaborators: mapCollaborators(data.collaborators),
    // Ausente = el evento nunca activó el módulo de comida/bebida (ver
    // src/types/concessions.ts) — nunca se le pone un default acá, un
    // objeto vacío se interpretaría como "activado sin config".
    concessions: (data.concessions as ConcessionsConfig) || undefined,
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

// A diferencia de toMillis (siempre Timestamp real, createdAt/updatedAt
// vienen de serverTimestamp() sin excepción), invitedAt de un colaborador
// puede ser un Timestamp (acceptCollaboratorInvite.ts, Cloud Function) o un
// number ya resuelto (scripts/backfill-collaborators-from-legacy.mjs) — acá
// se acepta cualquiera de los dos.
function toMillisOrNumber(value: unknown): number {
  if (typeof value === 'number') return value
  return toMillis(value)
}

function mapCollaborators(raw: unknown): EventData['collaborators'] {
  if (!raw || typeof raw !== 'object') return undefined
  const entries = Object.entries(raw as Record<string, Record<string, unknown>>).map(
    ([uid, entry]): [string, CollaboratorEntry] => [
      uid,
      {
        email: entry.email as string,
        role: entry.role as CollaboratorEntry['role'],
        permissionOverrides: entry.permissionOverrides as CollaboratorEntry['permissionOverrides'],
        invitedBy: entry.invitedBy as string,
        invitedAt: toMillisOrNumber(entry.invitedAt),
      },
    ],
  )
  return Object.fromEntries(entries)
}
