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
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { getEvent } from './events'
import { addToWaitlist } from './waitlist'
import { getUserProfile } from './userProfile'
import { sendCheckinSummaryEmail } from '../utils/emailjs'
import type { CompanionData, GuestData, GuestPaymentStatus, RsvpStatus } from '../types'
import { GuestSchema, warnIfInvalidShape } from '../types/schemas'
import {
  GUEST_FULL_NAME_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
} from '../utils/validation'

export interface NewGuestInput {
  name: string
  lastName?: string
  phone?: string
  companions?: CompanionData[]
  isGroup?: boolean
}

function generateQrToken(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

// Cuántas personas representa un invitado (él + sus acompañantes). Única
// fuente de verdad para esta cuenta — antes estaba reimplementada por
// separado en checkInGuest y dos veces en useGuestStats.ts; cambiarla en un
// solo lugar y no en otro desincronizaba el conteo de checkedInCount/stats.
export function partySize(guest: { companions: CompanionData[] }): number {
  return 1 + guest.companions.length
}

// `phone` NUNCA se guarda en el documento de `guests`: ese documento es
// legible públicamente (necesario para que el pase /pass/:eventId/:qrToken
// funcione sin login) y es PII. Vive aparte, en `guestContacts/{guestId}`,
// cuya regla de Firestore solo permite lectura al organizador/co-organizador/
// admin. Ver firestore.rules.
function buildNewGuestPayload(input: {
  name: string
  lastName?: string
  companions?: CompanionData[]
  isGroup?: boolean
}) {
  return {
    name: input.name,
    lastName: input.lastName || '',
    companions: input.companions || [],
    isGroup: input.isGroup || false,
    rsvpStatus: 'pending' as const,
    qrToken: generateQrToken(),
    status: 'invited' as const,
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    exitType: null,
    lockToken: null,
    paymentStatus: 'unpaid' as const,
    createdAt: serverTimestamp(),
  }
}

function contactRef(eventId: string, guestId: string) {
  return doc(db, 'events', eventId, 'guestContacts', guestId)
}

export type AddGuestResult = { status: 'added'; id: string } | { status: 'waitlisted' }

// Si el cupo ya está lleno, el invitado no se rechaza: se manda directo a la
// lista de espera (misma colección/flujo que usa el organizador para
// promover manualmente, ver firebase/waitlist.ts) en vez de devolver un
// error sin alternativa. Chequeo no transaccional a propósito: este flujo lo
// dispara un organizador escribiendo en su propio formulario (baja
// concurrencia), a diferencia de registerWalkInGuest (registro público,
// donde sí hace falta una transacción por el volumen de tráfico concurrente).
export async function addGuest(eventId: string, input: NewGuestInput): Promise<AddGuestResult> {
  const name = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const lastName = input.lastName
    ? requireMaxLength(input.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
    : ''
  const phone = input.phone ? requireMaxLength(input.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''

  const event = await getEvent(eventId)
  if (event && event.capacity > 0 && event.guestCount >= event.capacity) {
    await addToWaitlist(eventId, name, lastName, phone)
    return { status: 'waitlisted' }
  }

  const batch = writeBatch(db)
  const guestRef = doc(collection(db, 'events', eventId, 'guests'))
  const payload = buildNewGuestPayload({ ...input, name, lastName })
  batch.set(guestRef, payload)
  if (phone) {
    batch.set(contactRef(eventId, guestRef.id), { phone })
  }
  batch.update(doc(db, 'events', eventId), {
    guestCount: increment(1),
    peopleCount: increment(partySize(payload)),
  })
  await batch.commit()
  return { status: 'added', id: guestRef.id }
}

// Firestore rechaza batches de más de 500 operaciones; se reparte en chunks de
// 450 (margen para el update del contador) confirmados uno a la vez. Si un
// chunk falla, los anteriores ya quedaron guardados y guestCount refleja
// exactamente lo que se confirmó — no hay overselling silencioso ni fallo
// total al cargar listas grandes.
const BULK_CHUNK_SIZE = 450

export async function addGuestsBulk(eventId: string, names: string[]) {
  // Se valida la lista completa ANTES de escribir el primer chunk: si un solo
  // nombre es inválido, ningún chunk se guarda — evita el caso de un alta
  // parcial (algunos guests ya creados) por un error en una línea cualquiera
  // de la lista pegada.
  const trimmedNames = names.map((name) =>
    requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre'),
  )
  for (let i = 0; i < trimmedNames.length; i += BULK_CHUNK_SIZE) {
    const slice = trimmedNames.slice(i, i + BULK_CHUNK_SIZE)
    const batch = writeBatch(db)
    for (const name of slice) {
      const guestRef = doc(collection(db, 'events', eventId, 'guests'))
      batch.set(guestRef, buildNewGuestPayload({ name }))
    }
    // Cada invitado de una carga masiva es individual sin acompañantes
    // (partySize == 1), así que peopleCount sube lo mismo que guestCount acá.
    batch.update(doc(db, 'events', eventId), {
      guestCount: increment(slice.length),
      peopleCount: increment(slice.length),
    })
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

  // Si `companions` cambia de largo (acompañantes agregados/quitados, o
  // cantidad de integrantes editada en una familia), partySize() de este
  // invitado cambia — hay que ajustar peopleCount por la diferencia exacta,
  // en la misma transacción que guarda el nuevo array, para que no quede
  // desalineado con la suma real de personas del evento.
  if (guestFields.companions !== undefined) {
    const guestRef = doc(db, 'events', eventId, 'guests', guestId)
    const eventRef = doc(db, 'events', eventId)
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(guestRef)
      if (!snap.exists()) return
      const before = partySize(mapGuest(snap.id, snap.data()))
      const after = 1 + guestFields.companions!.length
      transaction.update(guestRef, { ...guestFields })
      if (phone !== undefined) {
        transaction.set(contactRef(eventId, guestId), { phone }, { merge: true })
      }
      if (after !== before) {
        transaction.update(eventRef, { peopleCount: increment(after - before) })
      }
    })
    return
  }

  const batch = writeBatch(db)
  if (Object.keys(guestFields).length > 0) {
    batch.update(doc(db, 'events', eventId, 'guests', guestId), { ...guestFields })
  }
  if (phone !== undefined) {
    batch.set(contactRef(eventId, guestId), { phone }, { merge: true })
  }
  await batch.commit()
}

// Recibe el invitado completo (no solo su id) porque descontar los 4
// contadores del evento correctamente requiere su partySize() y su presencia
// actual, no solo si alguna vez hizo check-in: antes se restaba 1 de
// checkedInCount sin importar cuántas personas representaba (dejaba ese
// contador inflado al borrar un invitado con acompañantes o una familia), y
// occupancyCount nunca se tocaba (si se borraba a alguien que seguía adentro,
// esa ocupación quedaba "fantasma" para siempre).
export async function deleteGuest(
  eventId: string,
  guest: Pick<GuestData, 'id' | 'status' | 'companions' | 'checkedOutAt' | 'exitType'>,
) {
  const size = partySize(guest)
  const batch = writeBatch(db)
  batch.delete(doc(db, 'events', eventId, 'guests', guest.id))
  batch.delete(contactRef(eventId, guest.id))
  const updates: Record<string, unknown> = {
    guestCount: increment(-1),
    peopleCount: increment(-size),
  }
  if (guest.status === 'checked_in') {
    updates.checkedInCount = increment(-size)
    if (guestPresence(guest) === 'inside') {
      updates.occupancyCount = increment(-size)
    }
  }
  batch.update(doc(db, 'events', eventId), updates)
  await batch.commit()
}

// El organizador necesita el teléfono junto con el resto del invitado (lista,
// CSV), pero ese campo vive en `guestContacts` (ver buildNewGuestPayload). Se
// suscribe a ambas colecciones y se fusionan por id antes de emitir, así el
// resto de la app sigue recibiendo el mismo `GuestData[]` de siempre sin saber
// que los datos vienen de dos lugares.
//
// TODO Fase 4+: ambas queries son sin `limit()` — en un evento de miles de
// invitados, cada organizador/co-organizador con el dashboard abierto
// descarga la colección completa en tiempo real. NO se le agregó un
// `limit()` simple en Subfase 3.2 a propósito: `guests` (el array completo)
// alimenta hoy 4 cosas que necesitan el TOTAL, no una página — la
// exportación CSV/PDF de EventDetail, las 6 estadísticas derivadas
// (totalPeople, rsvpYes/No, etc., ver useMemo en EventDetail.tsx) y la
// búsqueda/filtro de GuestList. Un `limit(50)` silencioso habría hecho que
// el CSV/PDF exportado, las estadísticas mostradas y la búsqueda dejaran de
// reflejar invitados reales en cualquier evento de más de 50 personas —
// una regresión funcional real, no un cambio "transparente". Requiere
// paginación cursor-based real en GuestList (con una query separada, sin
// límite, para export/stats) — cambio de mayor alcance que queda fuera de
// esta subfase.
export function subscribeToGuests(
  eventId: string,
  callback: (guests: GuestData[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
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

// Único punto que deriva el estado de presencia (adentro / afuera temporal /
// afuera definitivo / nunca escaneado) a partir de status+checkedOutAt+exitType
// — reusalo en vez de repetir la combinación booleana en cada archivo que
// necesita distinguir estos casos (Scanner.tsx, GuestList.tsx).
export type GuestPresence = 'invited' | 'inside' | 'temp_out' | 'final_out'

export function guestPresence(guest: Pick<GuestData, 'status' | 'checkedOutAt' | 'exitType'>): GuestPresence {
  if (guest.status !== 'checked_in') return 'invited'
  if (!guest.checkedOutAt) return 'inside'
  return guest.exitType === 'final' ? 'final_out' : 'temp_out'
}

export type CheckInResult =
  | { status: 'success'; guest: GuestData; reentry: boolean }
  | { status: 'already_checked_in'; guest: GuestData }
  | { status: 'payment_required'; guest: GuestData }
  | { status: 'blocked_final_exit'; guest: GuestData }
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
    const presence = guestPresence(guest)
    if (presence === 'inside') {
      return { status: 'already_checked_in', guest } as CheckInResult
    }
    if (presence === 'final_out') {
      return { status: 'blocked_final_exit', guest } as CheckInResult
    }
    const isReentry = presence === 'temp_out'

    // El gate de pago solo aplica a la primera entrada — un reingreso ya pasó
    // ese control antes; si el organizador cambia el estado de pago mientras
    // el invitado está afuera (p.ej. por una disputa), no debe bloquearle el
    // reingreso al mismo evento que ya estaba autorizado a estar.
    if (!isReentry) {
      const eventSnap = await transaction.get(eventRef)
      if (eventSnap.data()?.requiresPayment && guest.paymentStatus !== 'paid') {
        return { status: 'payment_required', guest } as CheckInResult
      }
    }

    transaction.update(guestRef, {
      status: 'checked_in',
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      // En un reingreso se preserva el checkedInAt/checkedInBy originales
      // (el "primer check-in" que ya muestra ScanResultModal) — solo se
      // pisan en la primera entrada real.
      ...(isReentry ? {} : { checkedInAt: serverTimestamp(), checkedInBy: scannedBy, checkedInByEmail: scannedByEmail }),
    })
    // checkedInCount es asistencia acumulada (cuánta gente entró alguna vez):
    // solo suma en la primera entrada, nunca en un reingreso. occupancyCount
    // es ocupación en vivo (gatea `capacity` en walkIn/registerWalkInGuest):
    // sube en CUALQUIER ingreso, primero o reingreso — un solo update para no
    // llamar transaction.update() dos veces sobre el mismo doc.
    transaction.update(eventRef, {
      occupancyCount: increment(partySize(guest)),
      ...(isReentry ? {} : { checkedInCount: increment(partySize(guest)) }),
    })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      type: 'check_in',
      ...(isReentry ? { reentry: true } : {}),
      timestamp: serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: { ...guest, status: 'checked_in', checkedOutAt: null, exitType: null },
      reentry: isReentry,
    } as CheckInResult
  })
}

export type CheckOutResult =
  | { status: 'success'; guest: GuestData; kind: 'temporary' | 'final' }
  | { status: 'not_checked_in' }
  | { status: 'already_checked_out'; guest: GuestData }
  | { status: 'not_found' }

export async function checkOutGuest(
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
  kind: 'temporary' | 'final',
): Promise<CheckOutResult> {
  const guestRef = await findGuestRefByToken(eventId, qrToken)
  if (!guestRef) {
    return { status: 'not_found' }
  }
  const eventRef = doc(db, 'events', eventId)

  return runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) {
      return { status: 'not_found' } as CheckOutResult
    }
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    const presence = guestPresence(guest)
    if (presence === 'invited') {
      return { status: 'not_checked_in' } as CheckOutResult
    }
    if (presence === 'temp_out' || presence === 'final_out') {
      return { status: 'already_checked_out', guest } as CheckOutResult
    }

    transaction.update(guestRef, {
      checkedOutAt: serverTimestamp(),
      checkedOutByEmail: scannedByEmail,
      exitType: kind,
    })
    // Toda salida (temporal o definitiva) libera ocupación en vivo — a
    // diferencia de checkedInCount (asistencia acumulada), que no se toca acá.
    transaction.update(eventRef, { occupancyCount: increment(-partySize(guest)) })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      type: 'check_out',
      exitKind: kind,
      timestamp: serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: { ...guest, checkedOutAt: Date.now(), checkedOutByEmail: scannedByEmail, exitType: kind },
      kind,
    } as CheckOutResult
  })
}

// Excepción del organizador (pedida explícitamente): revierte una salida
// "definitiva" a un estado que vuelve a permitir reingreso por escáner —
// limpia `exitType` sin tocar `checkedOutAt` (el invitado sigue figurando
// "afuera" hasta que efectivamente reingrese, checkInGuest se encarga de
// resetear checkedOutAt en ese momento).
export async function allowGuestReentry(eventId: string, guestId: string) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { exitType: null })
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

// ADVERTENCIA para cambios futuros (incluidos los hechos por IA): NO agregues
// un fallback `|| ''`/`|| algo` a qrToken como tienen los demás campos acá
// abajo — fabricar uno nuevo si faltara invalidaría el pase ya compartido con
// el invitado. Y `partySize()` (arriba en este archivo) es la única fuente de
// verdad para "invitado + acompañantes" — si necesitas ese cálculo en otro
// archivo, importala de acá, no la reimplementes.
//
// name/qrToken/status se castean sin fallback (ver mismo comentario en
// mapEvent, events.ts). Para qrToken en particular, fabricar un token nuevo
// si faltara sería activamente peligroso: invalidaría el pase ya compartido
// con el invitado. En su lugar, `warnIfInvalidShape` valida la forma final
// con Zod y loguea un error claro si algo no calza, sin cambiar el valor
// devuelto ni el tipo de retorno de esta función.
function mapGuest(id: string, data: Record<string, unknown>): GuestData {
  const guest: GuestData = {
    id,
    name: data.name as string,
    lastName: (data.lastName as string) || '',
    phone: (data.phone as string) || '',
    qrToken: data.qrToken as string,
    status: data.status as GuestData['status'],
    companions: normalizeCompanions(data.companions),
    isGroup: (data.isGroup as boolean) || false,
    rsvpStatus: (data.rsvpStatus as GuestData['rsvpStatus']) || 'pending',
    checkedInAt: toMillisOrNull(data.checkedInAt),
    checkedInBy: (data.checkedInBy as string) || null,
    checkedInByEmail: (data.checkedInByEmail as string) || null,
    checkedOutAt: toMillisOrNull(data.checkedOutAt),
    checkedOutByEmail: (data.checkedOutByEmail as string) || null,
    exitType: (data.exitType as GuestData['exitType']) || null,
    lockToken: (data.lockToken as string) || null,
    customData: (data.customData as Record<string, string>) || undefined,
    paymentStatus: (data.paymentStatus as GuestData['paymentStatus']) || 'unpaid',
    createdAt: toMillisOrNull(data.createdAt) || 0,
  }
  warnIfInvalidShape(GuestSchema, 'Guest', guest)
  return guest
}

function toMillisOrNull(value: unknown): number | null {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return null
}
