import {
  collection,
  deleteField,
  doc,
  documentId,
  getDoc,
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
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'
import { assertCapacityAvailable, fetchOfferedWaitlistCount, remainingCapacity } from './attendeeLimit'
import { enqueueNotification } from './notifications'
import { measureSpan, withListenerReporting } from '../lib/sentry'
import type { CompanionData, CustomField, EventData, GuestData, PaymentMethod, RsvpStatus } from '../types'
import { GuestSchema, warnIfInvalidShape } from '../types/schemas'
import {
  GUEST_CUSTOM_FIELD_MAX_COUNT,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_FULL_NAME_MAX,
  GUEST_LEGACY_MAX_COMPANIONS,
  GUEST_MAX_COMPANIONS,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
  requireValidEmail,
} from '../utils/validation'

// Única fuente de verdad para "cuántos acompañantes puede sumar UN invitado
// individual" en este evento (ver EventData.maxCompanions) — clampea a
// [0, GUEST_MAX_COMPANIONS]. "Ausente" (evento de antes de este campo) cae al
// default legacy, NO a 0: esos eventos siempre permitieron grupos de hasta 10
// en el autoregistro y tratarlos como "sin acompañantes" les cambió el
// comportamiento en silencio (ver GUEST_LEGACY_MAX_COMPANIONS). Un 0
// EXPLÍCITO sí significa "sin acompañantes". NO aplica a invitados
// `isGroup: true` ("familia o grupo"), que sigue gobernado por su propio tope
// GUEST_GROUP_MAX_MEMBERS — quien llama a esta función decide si corresponde
// chequearla para el invitado puntual que está creando/editando.
export function resolveMaxCompanions(event: Pick<EventData, 'maxCompanions'>): number {
  return Math.min(Math.max(event.maxCompanions ?? GUEST_LEGACY_MAX_COMPANIONS, 0), GUEST_MAX_COMPANIONS)
}

export interface NewGuestInput {
  name: string
  lastName?: string
  phone?: string
  // País (ISO alpha-2) del teléfono de arriba — ver el mismo campo en
  // GuestData (types/index.ts) y toWhatsAppPhone (utils/phone.ts).
  phoneCountry?: string
  companions?: CompanionData[]
  isGroup?: boolean
  customData?: Record<string, string>
}

// Token que codifica el QR del pase (buildPassUrl/extractQrToken en
// utils/qrUrl.ts). Se parte de un UUID v4 (crypto.randomUUID(), único y
// suficientemente aleatorio para no colisionar ni ser adivinable) pero se
// le sacan los guiones: van a parar a una URL pública (/pass/:qrToken) y a
// la data codificada en el QR físico — menos caracteres para el mismo
// contenido significa un QR más chico y más rápido de leer para el
// escáner, sin perder nada de la aleatoriedad del UUID original (los
// guiones de un UUID no aportan entropía, son puros separadores
// posicionales). Exportada para que capacity.ts (registerWalkInGuest) use
// la misma función en vez de reimplementar la misma línea.
export function generateQrToken(): string {
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
// funcione sin login) y es PII. Vive aparte, en `guestContacts/{guestId}`.
// Ver firestore.rules.
function buildNewGuestPayload(input: {
  name: string
  lastName?: string
  companions?: CompanionData[]
  isGroup?: boolean
  customData?: Record<string, string>
}) {
  return {
    name: input.name,
    lastName: input.lastName || '',
    companions: input.companions || [],
    isGroup: input.isGroup || false,
    customData: input.customData || {},
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
    paymentMethod: null,
    createdAt: serverTimestamp(),
  }
}

function contactRef(eventId: string, guestId: string) {
  return doc(db, 'events', eventId, 'guestContacts', guestId)
}

// Nombre del contador desnormalizado de EventData que corresponde a cada
// rsvpStatus (auditoría F22) — un solo lugar que traduce el valor al campo,
// para no repetir el mismo if/else en cada función que mueve un invitado de
// un balde RSVP a otro.
function rsvpCountField(status: RsvpStatus): 'rsvpYesCount' | 'rsvpNoCount' | 'rsvpPendingCount' {
  if (status === 'yes') return 'rsvpYesCount'
  if (status === 'no') return 'rsvpNoCount'
  return 'rsvpPendingCount'
}

// Por defecto (EventData.attendeeLimitEnabled ausente/false) el registro
// nunca se bloquea por cupo, igual que siempre. Cuando el organizador activa
// el límite (ver CAPACITY_LIMIT_ARCHITECTURE.md), esta alta manual tiene que
// respetarlo con la MISMA garantía que el autorregistro público
// (registerWalkInGuest, capacity.ts) — así que ahora corre dentro de una
// runTransaction (antes un writeBatch, que no permite leer el cupo vigente
// antes de escribir) que chequea assertCapacityAvailable antes de crear al
// invitado.
//
// `maxCompanions` es el límite YA RESUELTO para este evento (ver
// resolveMaxCompanions) — no se recibe el evento completo para no acoplar
// esta función a EventData por un solo campo. No aplica si `input.isGroup`
// (familia o grupo, gobernado por GUEST_GROUP_MAX_MEMBERS en la UI, no por
// este límite — ver EventData.maxCompanions).
export async function addGuest(eventId: string, input: NewGuestInput, maxCompanions: number): Promise<{ id: string }> {
  const name = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const lastName = input.lastName
    ? requireMaxLength(input.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
    : ''
  const phone = input.phone ? requireMaxLength(input.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
  for (const value of Object.values(input.customData || {})) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos personalizados')
  }
  if (!input.isGroup && (input.companions?.length || 0) > maxCompanions) {
    throw new Error(
      maxCompanions > 0
        ? `Este evento permite hasta ${maxCompanions} acompañante${maxCompanions === 1 ? '' : 's'} por invitado.`
        : 'Este evento no permite acompañantes.',
    )
  }

  return measureSpan('firestore.addGuest', 'db.firestore', async () => {
    const eventRef = doc(db, 'events', eventId)
    const guestRef = doc(collection(db, 'events', eventId, 'guests'))
    const payload = buildNewGuestPayload({ ...input, name, lastName })
    const size = partySize(payload)
    // Fuera de la transacción: ver el mismo comentario en capacity.ts
    // (registerWalkInGuest) — best-effort para no pisar una oferta de lista
    // de espera activa.
    const offeredCount = await fetchOfferedWaitlistCount(eventId)
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(eventRef)
      const data = (snap.data() || {}) as Record<string, unknown>
      assertCapacityAvailable(
        {
          attendeeLimitEnabled: data.attendeeLimitEnabled as boolean | undefined,
          peopleCount: typeof data.peopleCount === 'number' ? data.peopleCount : (typeof data.guestCount === 'number' ? data.guestCount : 0),
          capacity: data.capacity as number | undefined,
        },
        size,
        offeredCount,
      )
      tx.set(guestRef, payload)
      if (phone) {
        tx.set(contactRef(eventId, guestRef.id), {
          phone,
          ...(input.phoneCountry ? { phoneCountry: input.phoneCountry } : {}),
        })
      }
      tx.update(eventRef, {
        guestCount: increment(1),
        peopleCount: increment(size),
        // buildNewGuestPayload siempre arranca en 'pending' (ver ahí).
        rsvpPendingCount: increment(1),
      })
    })
    return { id: guestRef.id }
  })
}

// Firestore rechaza batches de más de 500 operaciones — pero el límite real
// acá es otro: firestore.rules (counterDeltaOk) solo permite mover
// guestCount/peopleCount del evento en ±50 por escritura cuando quien
// escribe es un coanfitrión (no el dueño, que no tiene ese tope). Con un
// chunk más grande, un coanfitrión con addGuests que pega una lista de más
// de 50 nombres se encontraba con el batch ENTERO rechazado por rules (el
// dueño no lo notaba porque su rama no tiene ese límite). 50 evita el
// problema para cualquiera de los dos, al costo de más idas y vueltas en
// listas muy grandes. Si un chunk falla, los anteriores ya quedaron
// guardados y guestCount refleja exactamente lo que se confirmó — no hay
// overselling silencioso ni fallo total al cargar listas grandes.
const BULK_CHUNK_SIZE = 50

// Resultado de una carga masiva/CSV cuando el cupo (attendeeLimitEnabled)
// corta la lista a mitad de camino: "llenar lo que entra + reportar" (ver
// CAPACITY_LIMIT_ARCHITECTURE.md §8), nunca todo-o-nada — desperdiciar
// lugares realmente disponibles porque el resto de una lista larga no entera
// es peor experiencia que una carga parcial bien explicada. Con el cupo
// desactivado (o sin alcanzarlo), `added` siempre es igual a la cantidad
// pedida y `skippedNames` queda vacío — mismo resultado que antes de esta
// feature.
export interface BulkAddResult {
  added: number
  skippedNames: string[]
}

export async function addGuestsBulk(eventId: string, names: string[]): Promise<BulkAddResult> {
  // Se valida la lista completa ANTES de escribir el primer chunk: si un solo
  // nombre es inválido, ningún chunk se guarda — evita el caso de un alta
  // parcial (algunos guests ya creados) por un error en una línea cualquiera
  // de la lista pegada.
  const trimmedNames = names.map((name) =>
    requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre'),
  )
  return measureSpan('firestore.addGuestsBulk', 'db.firestore', async () => {
    const eventRef = doc(db, 'events', eventId)
    // Una sola lectura antes de todo el lote (no una por chunk): sigue
    // siendo best-effort, no la garantía dura — ver el mismo comentario en
    // addGuest.
    const offeredCount = await fetchOfferedWaitlistCount(eventId)
    let added = 0
    for (let i = 0; i < trimmedNames.length; i += BULK_CHUNK_SIZE) {
      const slice = trimmedNames.slice(i, i + BULK_CHUNK_SIZE)
      // writeBatch → runTransaction: hace falta leer el cupo vigente antes de
      // decidir cuántos de este chunk entran, en la MISMA operación atómica
      // que los crea (mismo motivo que en addGuest, ver ahí).
      let fitCount = slice.length
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(eventRef)
        const data = (snap.data() || {}) as Record<string, unknown>
        const remaining = remainingCapacity({
          attendeeLimitEnabled: data.attendeeLimitEnabled as boolean | undefined,
          peopleCount: typeof data.peopleCount === 'number' ? data.peopleCount : (typeof data.guestCount === 'number' ? data.guestCount : 0),
          capacity: data.capacity as number | undefined,
        }, offeredCount)
        // null = cupo ilimitado, el chunk entra completo.
        fitCount = remaining === null ? slice.length : Math.min(slice.length, remaining)
        const fitting = slice.slice(0, fitCount)
        for (const name of fitting) {
          const guestRef = doc(collection(db, 'events', eventId, 'guests'))
          tx.set(guestRef, buildNewGuestPayload({ name }))
        }
        // Cada invitado de una carga masiva es individual sin acompañantes
        // (partySize == 1), así que peopleCount sube lo mismo que guestCount acá.
        if (fitting.length > 0) {
          tx.update(eventRef, {
            guestCount: increment(fitting.length),
            peopleCount: increment(fitting.length),
            rsvpPendingCount: increment(fitting.length),
          })
        }
      })
      added += fitCount
      // El chunk no entró completo: ya no queda lugar, no tiene sentido seguir
      // con los chunks siguientes.
      if (fitCount < slice.length) {
        return { added, skippedNames: trimmedNames.slice(i + fitCount) }
      }
    }
    return { added, skippedNames: [] }
  })
}

export interface ImportedGuestRow {
  name: string
  lastName?: string
  phone?: string
  email?: string
}

// Import de invitados desde CSV (ver src/utils/csvImport.ts, que arma este
// array a partir del archivo) — mismo chunking/contador que addGuestsBulk,
// pero cada fila puede traer apellido/teléfono/email por separado (el CSV
// sí distingue columnas; pegar una lista de nombres no). guestContacts
// necesita el permiso addGuests para su `create` (ver firestore.rules) —
// coincide con el que ya exige `guests/{guestId}` para esta misma operación.
export async function addGuestsFromRows(eventId: string, rows: ImportedGuestRow[]): Promise<BulkAddResult> {
  const validated = rows.map((row) => ({
    name: requireMaxLength(requireNonEmpty(row.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre'),
    lastName: row.lastName?.trim() ? requireMaxLength(row.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido') : '',
    phone: row.phone?.trim() ? requireMaxLength(row.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : '',
    // Minúsculas: ver el mismo comentario en capacity.ts (registerWalkInGuest)
    // — permite que reclaimInvitationsByEmail encuentre este contacto por
    // igualdad exacta contra el email verificado de la cuenta.
    email: row.email?.trim() ? requireMaxLength(requireValidEmail(row.email.trim().toLowerCase(), 'El email'), GUEST_EMAIL_MAX, 'El email') : '',
  }))

  return measureSpan('firestore.addGuestsFromRows', 'db.firestore', async () => {
    const eventRef = doc(db, 'events', eventId)
    // Ver el mismo comentario en addGuestsBulk.
    const offeredCount = await fetchOfferedWaitlistCount(eventId)
    let added = 0
    for (let i = 0; i < validated.length; i += BULK_CHUNK_SIZE) {
      const slice = validated.slice(i, i + BULK_CHUNK_SIZE)
      // Mismo motivo que addGuestsBulk: writeBatch → runTransaction para leer
      // el cupo vigente antes de decidir cuántas filas de este chunk entran.
      let fitCount = slice.length
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(eventRef)
        const data = (snap.data() || {}) as Record<string, unknown>
        const remaining = remainingCapacity({
          attendeeLimitEnabled: data.attendeeLimitEnabled as boolean | undefined,
          peopleCount: typeof data.peopleCount === 'number' ? data.peopleCount : (typeof data.guestCount === 'number' ? data.guestCount : 0),
          capacity: data.capacity as number | undefined,
        }, offeredCount)
        fitCount = remaining === null ? slice.length : Math.min(slice.length, remaining)
        const fitting = slice.slice(0, fitCount)
        for (const row of fitting) {
          const guestRef = doc(collection(db, 'events', eventId, 'guests'))
          tx.set(guestRef, buildNewGuestPayload({ name: row.name, lastName: row.lastName }))
          if (row.phone || row.email) {
            const contact: Record<string, string> = {}
            if (row.phone) contact.phone = row.phone
            if (row.email) contact.email = row.email
            tx.set(contactRef(eventId, guestRef.id), contact)
          }
        }
        if (fitting.length > 0) {
          tx.update(eventRef, {
            guestCount: increment(fitting.length),
            peopleCount: increment(fitting.length),
            rsvpPendingCount: increment(fitting.length),
          })
        }
      })
      added += fitCount
      if (fitCount < slice.length) {
        return {
          added,
          skippedNames: validated.slice(i + fitCount).map((row) => `${row.name} ${row.lastName || ''}`.trim()),
        }
      }
    }
    return { added, skippedNames: [] }
  })
}

export interface UpdateGuestInput {
  name?: string
  lastName?: string
  phone?: string
  phoneCountry?: string
  companions?: CompanionData[]
  customData?: Record<string, string>
}

// `maxCompanions` es el límite YA RESUELTO para este evento (ver
// resolveMaxCompanions) — solo se valida contra él cuando `companions`
// cambia de largo Y el invitado no es una familia/grupo (`isGroup`, que se
// lee del documento existente dentro de la transacción, no de `input`: esta
// función no distingue de antemano si el invitado que está editando es un
// grupo o no).
export async function updateGuest(eventId: string, guestId: string, input: UpdateGuestInput, maxCompanions: number) {
  const { phone, phoneCountry, ...guestFields } = input

  // Si `companions` cambia de largo (acompañantes agregados/quitados, o
  // cantidad de integrantes editada en una familia), partySize() de este
  // invitado cambia — hay que ajustar peopleCount (y paidCount, si ya había
  // pagado) por la diferencia exacta, en la misma transacción que guarda el
  // nuevo array, para que no quede desalineado con la suma real de personas
  // del evento.
  if (guestFields.companions !== undefined) {
    const guestRef = doc(db, 'events', eventId, 'guests', guestId)
    const eventRef = doc(db, 'events', eventId)
    // Fuera de la transacción: ver el mismo comentario en addGuest. Se pide
    // siempre que `companions` esté en el input (no solo cuando termina
    // aumentando) para no tener que decidir adentro de la transacción si
    // hace falta o no — el costo de una lectura de más en el caso que
    // termina bajando/igual es bajo comparado con la complejidad de pedirla
    // condicionalmente.
    const offeredCount = await fetchOfferedWaitlistCount(eventId)
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(guestRef)
      if (!snap.exists()) return
      const existing = mapGuest(snap.id, snap.data())
      const before = partySize(existing)
      const after = 1 + guestFields.companions!.length
      // Grandfathering: si el invitado ya tenía más acompañantes que el
      // límite actual (evento cargado antes de configurarlo, o el
      // organizador lo bajó después), se sigue permitiendo guardar mientras
      // no AUMENTE el conteo — solo se bloquea sumar más allá del límite.
      // Mismo criterio que companionsWithinLimit en firestore.rules.
      if (!existing.isGroup && guestFields.companions!.length > maxCompanions
        && guestFields.companions!.length > existing.companions.length) {
        throw new Error(
          maxCompanions > 0
            ? `Este evento permite hasta ${maxCompanions} acompañante${maxCompanions === 1 ? '' : 's'} por invitado.`
            : 'Este evento no permite acompañantes.',
        )
      }
      // Límite de asistentes (ver CAPACITY_LIMIT_ARCHITECTURE.md): sumar
      // acompañantes a un invitado ya existente ocupa lugares nuevos ni más
      // ni menos que crear uno — tiene que respetar el mismo cupo, chequeado
      // acá antes de escribir nada. Solo aplica cuando `after > before`
      // (sumar); bajar acompañantes siempre libera lugares, nunca se
      // bloquea.
      if (after > before) {
        const eventSnap = await transaction.get(eventRef)
        const eventData = (eventSnap.data() || {}) as Record<string, unknown>
        assertCapacityAvailable(
          {
            attendeeLimitEnabled: eventData.attendeeLimitEnabled as boolean | undefined,
            peopleCount: typeof eventData.peopleCount === 'number' ? eventData.peopleCount : (typeof eventData.guestCount === 'number' ? eventData.guestCount : 0),
            capacity: eventData.capacity as number | undefined,
          },
          after - before,
          offeredCount,
        )
      }
      transaction.update(guestRef, { ...guestFields })
      if (phone !== undefined) {
        transaction.set(contactRef(eventId, guestId), { phone, ...(phoneCountry !== undefined ? { phoneCountry } : {}) }, { merge: true })
      }
      if (after !== before) {
        const eventUpdates: Record<string, unknown> = { peopleCount: increment(after - before) }
        if (existing.paymentStatus === 'paid') {
          eventUpdates.paidCount = increment(after - before)
        }
        transaction.update(eventRef, eventUpdates)
      }
    })
    return
  }

  const batch = writeBatch(db)
  if (Object.keys(guestFields).length > 0) {
    batch.update(doc(db, 'events', eventId, 'guests', guestId), { ...guestFields })
  }
  if (phone !== undefined) {
    batch.set(contactRef(eventId, guestId), { phone, ...(phoneCountry !== undefined ? { phoneCountry } : {}) }, { merge: true })
  }
  await batch.commit()
}

export interface GuestSelfEditInput {
  name: string
  lastName: string
  phone: string
  phoneCountry?: string
  email: string
  companions: CompanionData[]
  customData: Record<string, string>
  // Selección de menú propia (Feature 6) — la de cada acompañante ya viaja
  // dentro de `companions[i].menuSelection`, sin necesidad de un campo
  // aparte.
  menuSelection?: GuestData['menuSelection']
}

// Lee email/phone actuales para precargar el formulario de auto-edición
// (GuestEditModal). Se llama recién al abrir el modal, no en la carga
// inicial del pase, para no gastar una lectura extra en cada visita de
// invitados que nunca editan. Si el invitado nunca tuvo contacto cargado
// (p.ej. de lista, agregado sin teléfono), devuelve strings vacíos.
export async function getGuestContact(eventId: string, guestId: string): Promise<{ email: string; phone: string; phoneCountry: string }> {
  const snap = await getDoc(contactRef(eventId, guestId))
  const data = snap.data()
  return {
    email: (data?.email as string) || '',
    phone: (data?.phone as string) || '',
    phoneCountry: (data?.phoneCountry as string) || '',
  }
}

// Auto-edición del propio invitado desde su pase (GuestPass, "Editar mis
// datos") — a diferencia de updateGuest() (organizador), NUNCA cambia la
// CANTIDAD de acompañantes (isValidGuestSelfEdit en firestore.rules lo
// exige), así que no hay ningún contador de evento que ajustar y un
// writeBatch alcanza (no hace falta runTransaction). Valida cada campo
// individualmente porque Firestore Rules no puede iterar el contenido de
// `companions`/`customData` elemento por elemento — esta es la única
// barrera real de longitud para esos valores.
export async function updateGuestSelf(
  eventId: string,
  guestId: string,
  lockToken: string | null,
  input: GuestSelfEditInput,
  customFields: CustomField[],
): Promise<void> {
  const name = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const lastName = requireMaxLength((input.lastName || '').trim(), GUEST_NAME_PART_MAX, 'El apellido')
  const phone = requireMaxLength((input.phone || '').trim(), GUEST_PHONE_MAX, 'El teléfono')
  const phoneCountry = (input.phoneCountry || '').trim()
  const emailTrimmed = (input.email || '').trim().toLowerCase()
  const email = emailTrimmed
    ? requireMaxLength(requireValidEmail(emailTrimmed, 'El email'), GUEST_EMAIL_MAX, 'El email')
    : ''

  const companions = input.companions.map((c, i) => ({
    name: requireMaxLength((c.name || '').trim(), GUEST_NAME_PART_MAX, `El nombre del acompañante ${i + 1}`),
    lastName: requireMaxLength((c.lastName || '').trim(), GUEST_NAME_PART_MAX, `El apellido del acompañante ${i + 1}`),
    phone: requireMaxLength((c.phone || '').trim(), GUEST_PHONE_MAX, `El teléfono del acompañante ${i + 1}`),
    phoneCountry: (c.phoneCountry || '').trim(),
    // Passthrough sin validar (mismo criterio que customData abajo: solo se
    // limita tamaño, no forma) — optionId/restrictionIds siempre vienen de
    // MenuSelectionInput, nunca tecleados a mano. Clave OMITIDA (no
    // `undefined`) cuando el acompañante no eligió menú — Firestore rechaza
    // `undefined` como valor de campo, incluso anidado dentro de un array.
    ...(c.menuSelection !== undefined ? { menuSelection: c.menuSelection } : {}),
  }))

  // Solo se guardan claves que correspondan a un customField vigente del
  // evento — un campo borrado por el organizador después del registro no se
  // vuelve a arrastrar para siempre.
  const allowedFieldIds = new Set(customFields.map((f) => f.id))
  const customData: Record<string, string> = {}
  for (const [key, value] of Object.entries(input.customData || {})) {
    if (!allowedFieldIds.has(key)) continue
    customData[key] = requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos personalizados')
  }
  if (Object.keys(customData).length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new Error('El formulario tiene demasiados campos.')
  }

  const batch = writeBatch(db)
  batch.update(doc(db, 'events', eventId, 'guests', guestId), {
    name,
    lastName,
    companions,
    customData,
    menuSelection: input.menuSelection ?? deleteField(),
    lockToken,
  })
  batch.set(contactRef(eventId, guestId), { email, phone, phoneCountry, lockToken }, { merge: true })
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
  guest: Pick<GuestData, 'id' | 'status' | 'companions' | 'checkedOutAt' | 'exitType' | 'paymentStatus' | 'rsvpStatus'>,
) {
  const size = partySize(guest)
  const batch = writeBatch(db)
  batch.delete(doc(db, 'events', eventId, 'guests', guest.id))
  batch.delete(contactRef(eventId, guest.id))
  const updates: Record<string, unknown> = {
    guestCount: increment(-1),
    peopleCount: increment(-size),
    [rsvpCountField(guest.rsvpStatus)]: increment(-1),
  }
  if (guest.status === 'checked_in') {
    updates.checkedInCount = increment(-size)
    if (guestPresence(guest) === 'inside') {
      updates.occupancyCount = increment(-size)
    }
  }
  if (guest.paymentStatus === 'paid') {
    updates.paidCount = increment(-size)
  }
  batch.update(doc(db, 'events', eventId), updates)
  await batch.commit()
}

// Alternativa a deleteGuest para el día del evento: un invitado sin pagar
// que no se presenta puede pasarse a la lista de espera en vez de
// eliminarlo — libera su lugar igual (mismos contadores que deleteGuest,
// dispara la cascada de la lista de espera vía onCapacityFreed) pero
// conserva su registro por si aparece más tarde. Recibe el GuestData ya
// cargado en memoria (phone/email ya vienen mezclados desde guestContacts
// por subscribeToGuests) — no hace falta una lectura extra.
export async function moveGuestToWaitlist(
  eventId: string,
  guest: Pick<
    GuestData,
    'id' | 'name' | 'lastName' | 'phone' | 'phoneCountry' | 'email' | 'customData' | 'status' | 'companions' | 'checkedOutAt' | 'exitType' | 'paymentStatus' | 'rsvpStatus'
  >,
): Promise<void> {
  const size = partySize(guest)
  const fullName = `${guest.name}${guest.lastName ? ` ${guest.lastName}` : ''}`.trim()
  const batch = writeBatch(db)

  batch.delete(doc(db, 'events', eventId, 'guests', guest.id))
  batch.delete(contactRef(eventId, guest.id))
  const updates: Record<string, unknown> = {
    guestCount: increment(-1),
    peopleCount: increment(-size),
    [rsvpCountField(guest.rsvpStatus)]: increment(-1),
  }
  if (guest.status === 'checked_in') {
    updates.checkedInCount = increment(-size)
    if (guestPresence(guest) === 'inside') {
      updates.occupancyCount = increment(-size)
    }
  }
  if (guest.paymentStatus === 'paid') {
    updates.paidCount = increment(-size)
  }
  batch.update(doc(db, 'events', eventId), updates)

  batch.set(doc(collection(db, 'events', eventId, 'waitlist')), {
    name: fullName,
    partySize: size,
    ...(guest.phone ? { phone: guest.phone } : {}),
    ...(guest.phoneCountry ? { phoneCountry: guest.phoneCountry } : {}),
    ...(guest.email ? { email: guest.email } : {}),
    ...(guest.customData && Object.keys(guest.customData).length > 0 ? { customData: guest.customData } : {}),
    waitlistToken: crypto.randomUUID().replace(/-/g, ''),
    status: 'waiting',
    priorityBoost: 0,
    createdAt: serverTimestamp(),
    offerToken: null,
    offerExpiresAt: null,
    respondedAt: null,
    promotedGuestId: null,
    promotionReason: null,
  })

  await batch.commit()
}

// Agrupa `items` en lotes cuya suma de partySize() nunca supera
// `COUNTER_DELTA_CAP` (50, el mismo margen que counterDeltaOk exige en
// firestore.rules para un co-organizador — el dueño no tiene ese tope, pero
// trocear igual no cambia el resultado, solo agrega alguna transacción/batch
// más de más para selecciones muy grandes). Usada por bulkDeleteGuests/
// bulkSetGuestPaymentStatus para que cada lote sea UNA sola escritura al
// documento del evento, en vez de que cada invitado dispare la suya —
// GuestList.tsx antes llamaba a deleteGuest/setGuestPaymentStatus una vez
// POR invitado seleccionado, con N transacciones/batches concurrentes
// compitiendo por el mismo documento (el anti-patrón de "documento
// caliente" de Firestore: con selecciones grandes, muchas de esas escrituras
// abortaban y reintentaban, cada reintento facturando lectura+escritura de
// nuevo).
const COUNTER_DELTA_CAP = 50

function chunkByPartySize<T>(items: T[], sizeOf: (item: T) => number): T[][] {
  const chunks: T[][] = []
  let current: T[] = []
  let currentSize = 0
  for (const item of items) {
    const size = sizeOf(item)
    if (current.length > 0 && currentSize + size > COUNTER_DELTA_CAP) {
      chunks.push(current)
      current = []
      currentSize = 0
    }
    current.push(item)
    currentSize += size
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

export interface BulkResult {
  ok: number
  failed: number
}

// Versión masiva de deleteGuest: en vez de que cada invitado seleccionado
// dispare su propio batch (cada uno leyendo-nada-pero-escribiendo el
// documento del evento por separado), cada LOTE hace un único batch que
// borra hasta 50 (en partySize) invitados/contactos y ajusta los contadores
// del evento con el delta agregado del lote en una sola escritura. Mismo
// criterio que deleteGuest: confía en el `guest` ya cargado en pantalla para
// calcular status/companions/paymentStatus, no vuelve a leer cada documento
// (igual que el deleteGuest individual ya hacía).
export async function bulkDeleteGuests(
  eventId: string,
  guests: Pick<GuestData, 'id' | 'status' | 'companions' | 'checkedOutAt' | 'exitType' | 'paymentStatus' | 'rsvpStatus'>[],
): Promise<BulkResult> {
  const chunks = chunkByPartySize(guests, partySize)
  let ok = 0
  let failed = 0
  for (const chunk of chunks) {
    try {
      const batch = writeBatch(db)
      let guestCountDelta = 0
      let peopleCountDelta = 0
      let checkedInCountDelta = 0
      let occupancyCountDelta = 0
      let paidCountDelta = 0
      const rsvpDeltas: Record<'rsvpYesCount' | 'rsvpNoCount' | 'rsvpPendingCount', number> = {
        rsvpYesCount: 0,
        rsvpNoCount: 0,
        rsvpPendingCount: 0,
      }
      for (const guest of chunk) {
        const size = partySize(guest)
        batch.delete(doc(db, 'events', eventId, 'guests', guest.id))
        batch.delete(contactRef(eventId, guest.id))
        guestCountDelta -= 1
        peopleCountDelta -= size
        if (guest.status === 'checked_in') {
          checkedInCountDelta -= size
          if (guestPresence(guest) === 'inside') occupancyCountDelta -= size
        }
        if (guest.paymentStatus === 'paid') paidCountDelta -= size
        rsvpDeltas[rsvpCountField(guest.rsvpStatus)] -= 1
      }
      const updates: Record<string, unknown> = {
        guestCount: increment(guestCountDelta),
        peopleCount: increment(peopleCountDelta),
      }
      if (checkedInCountDelta !== 0) updates.checkedInCount = increment(checkedInCountDelta)
      if (occupancyCountDelta !== 0) updates.occupancyCount = increment(occupancyCountDelta)
      if (paidCountDelta !== 0) updates.paidCount = increment(paidCountDelta)
      for (const [field, delta] of Object.entries(rsvpDeltas)) {
        if (delta !== 0) updates[field] = increment(delta)
      }
      batch.update(doc(db, 'events', eventId), updates)
      await batch.commit()
      ok += chunk.length
    } catch (err) {
      console.error('Error en bulkDeleteGuests para un lote:', err)
      failed += chunk.length
    }
  }
  return { ok, failed }
}

// Versión masiva de setGuestPaymentStatus — igual que la versión suelta, toda
// la lógica (releer cada invitado, delta agregado de paidCount, elegir
// método) vive en la Cloud Function `bulkSetGuestPaymentStatus`
// (functions/src/payments/confirmPayment.ts:bulkConfirmGuestPayments).
// `defaultMethod` reemplaza al `resolveMethod` que este archivo pasaba antes
// (un callback no puede viajar por la red): el servidor conserva el método
// propio del invitado si ya tenía uno, y usa `defaultMethod` solo si no.
export async function bulkSetGuestPaymentStatus(
  eventId: string,
  guestIds: string[],
  paymentStatus: 'paid' | 'unpaid',
  defaultMethod?: PaymentMethod,
): Promise<BulkResult> {
  const callable = httpsCallable<
    { eventId: string; guestIds: string[]; paymentStatus: 'paid' | 'unpaid'; defaultMethod?: PaymentMethod },
    BulkResult
  >(functions, 'bulkSetGuestPaymentStatus')
  const result = await callable({ eventId, guestIds, paymentStatus, defaultMethod })
  return result.data
}

// Asignación masiva de segmentos (Feature 1: visibilidad de secciones por
// tipo de invitado) — a diferencia de bulkSetGuestPaymentStatus/
// bulkDeleteGuests, tags no alimenta ningún contador denormalizado del
// evento, así que alcanza con writeBatch simple (sin transacción ni delta
// agregado): cada lote es un solo commit de hasta 450 documentos (tope de
// Firestore), no 50 — no hay partySize que trocear de por medio.
const GUEST_TAG_WRITE_BATCH_SIZE = 450

export async function bulkSetGuestTags(
  eventId: string,
  guestIds: string[],
  tagIds: string[],
): Promise<BulkResult> {
  let ok = 0
  let failed = 0
  for (let i = 0; i < guestIds.length; i += GUEST_TAG_WRITE_BATCH_SIZE) {
    const chunk = guestIds.slice(i, i + GUEST_TAG_WRITE_BATCH_SIZE)
    try {
      const batch = writeBatch(db)
      for (const guestId of chunk) {
        batch.update(doc(db, 'events', eventId, 'guests', guestId), { tags: tagIds })
      }
      await batch.commit()
      ok += chunk.length
    } catch (err) {
      console.error('Error en bulkSetGuestTags para un lote:', err)
      failed += chunk.length
    }
  }
  return { ok, failed }
}

// El organizador necesita el teléfono (y, si existe, el email) junto con el
// resto del invitado (lista, exportación), pero esos campos viven en
// `guestContacts` (ver buildNewGuestPayload). Se suscribe a ambas colecciones
// y se fusionan por id antes de emitir, así el resto de la app sigue
// recibiendo el mismo `GuestData[]` de siempre sin saber que los datos vienen
// de dos lugares.
//
// TODO Fase 4+: ambas queries son sin `limit()` — en un evento de miles de
// invitados, cada organizador/co-organizador con el dashboard abierto
// descarga la colección completa en tiempo real. NO se le agregó un
// `limit()` simple en Subfase 3.2 a propósito: `guests` (el array completo)
// alimenta hoy varias cosas que necesitan el TOTAL, no una página — la
// exportación CSV/PDF/Excel de EventDetail y la búsqueda/filtro de
// GuestList. Un `limit()` a secas habría hecho que esas cosas dejaran de
// reflejar invitados reales en cualquier evento por encima del límite — una
// regresión funcional real, no un cambio "transparente". Fase 6 (auditoría
// de rendimiento): en vez de un límite fijo silencioso, `limitCount` deja la
// ventana en vivo ACOTADA por default (ver GUEST_WINDOW_DEFAULT) pero
// explícitamente ampliable a `null` (sin límite) — EventDetail.tsx lo hace
// al escribir en el buscador o exportar. Reports.tsx (auditoría de
// escalabilidad, hallazgo F3) ya NO usa este listener en absoluto — ver
// getAllGuests más abajo, una lectura puntual en vez de un listener sin
// límite reabierto en cada snapshot mientras la pantalla de reportes está
// abierta. `totalPeople`/`totalCollected`/rsvpYes/No/Pending tampoco
// dependen de esto — se toman de los contadores desnormalizados del evento.
export const GUEST_WINDOW_DEFAULT = 300

// guestContacts no tiene un campo de fecha para ordenar/acotar igual que
// `guests` (createdAt) — se pide por id exacto (query 'in', en lotes de 30,
// el máximo que acepta Firestore) en vez de suscribirse a la colección
// completa. Solo se vuelve a pedir el contacto de un id que TODAVÍA no está
// en caché (ver `contacts` más abajo): si un invitado ya cargado edita su
// teléfono/email, ese cambio puntual no llega en vivo hasta que se
// remonte la pantalla — trade-off aceptado a cambio de no releer el resto de
// contactos ya conocidos en cada snapshot de `guests` (que sí sigue en vivo
// completo, incluidos check-in/pago/RSVP).
const CONTACT_FETCH_CHUNK = 30

async function fetchContactsByIds(
  eventId: string,
  ids: string[],
): Promise<Record<string, { phone: string; phoneCountry: string; email: string }>> {
  const result: Record<string, { phone: string; phoneCountry: string; email: string }> = {}
  const chunks: string[][] = []
  for (let i = 0; i < ids.length; i += CONTACT_FETCH_CHUNK) chunks.push(ids.slice(i, i + CONTACT_FETCH_CHUNK))
  await Promise.all(
    chunks.map(async (chunk) => {
      const snap = await getDocs(
        query(collection(db, 'events', eventId, 'guestContacts'), where(documentId(), 'in', chunk)),
      )
      snap.docs.forEach((d) => {
        result[d.id] = {
          phone: (d.data().phone as string) || '',
          phoneCountry: (d.data().phoneCountry as string) || '',
          email: (d.data().email as string) || '',
        }
      })
    }),
  )
  return result
}

export function subscribeToGuests(
  eventId: string,
  callback: (guests: GuestData[]) => void,
  onError?: (error: Error) => void,
  limitCount: number | null = GUEST_WINDOW_DEFAULT,
): Unsubscribe {
  let baseGuests: GuestData[] | null = null
  let contacts: Record<string, { phone: string; phoneCountry: string; email: string }> = {}
  let cancelled = false

  function emit() {
    if (baseGuests === null) return
    callback(
      baseGuests.map((g) => ({
        ...g,
        phone: contacts[g.id]?.phone || g.phone,
        phoneCountry: contacts[g.id]?.phoneCountry || g.phoneCountry,
        email: contacts[g.id]?.email || g.email,
      })),
    )
  }

  const constraints = [orderBy('createdAt', 'asc'), ...(limitCount !== null ? [limit(limitCount)] : [])]
  const guestsQuery = query(collection(db, 'events', eventId, 'guests'), ...constraints)
  const unsubGuests = onSnapshot(
    guestsQuery,
    (snapshot) => {
      baseGuests = snapshot.docs.map((d) => mapGuest(d.id, d.data()))
      emit()
      const missingIds = baseGuests.filter((g) => !(g.id in contacts)).map((g) => g.id)
      if (missingIds.length > 0) {
        fetchContactsByIds(eventId, missingIds)
          .then((fetched) => {
            if (cancelled) return
            contacts = { ...contacts, ...fetched }
            emit()
          })
          .catch((err) => {
            // No se reporta a onError (el listener de arriba ya sigue
            // funcionando bien sin estos contactos, no hace falta tumbar
            // toda la suscripción) — pero SÍ hay que atraparlo: sin este
            // catch, una petición en vuelo que rechaza (ej. la conexión se
            // corta) queda como unhandled rejection.
            if (cancelled) return
            console.error('Error fetching guest contacts:', err)
          })
      }
    },
    withListenerReporting('guests', onError),
  )

  return () => {
    cancelled = true
    unsubGuests()
  }
}

// Carga puntual (no en vivo) de TODOS los invitados — a diferencia de
// subscribeToGuests, no arma ningún listener ni fusiona guestContacts
// (Reports.tsx, el único llamador, no muestra ni exporta phone/email; esos
// campos quedan en '' por el fallback de mapGuest, sin costo de lectura
// extra a esa colección). Reemplaza el patrón anterior de Reports.tsx
// (showAllGuests()/useEvent: un listener SIN LÍMITE reabierto en cada
// snapshot mientras la pantalla está abierta, ver auditoría de
// escalabilidad hallazgo F3) por una sola lectura, refrescada a pedido con
// el mismo botón "Actualizar" que ya usa getCheckins.
export async function getAllGuests(eventId: string): Promise<GuestData[]> {
  const q = query(collection(db, 'events', eventId, 'guests'), orderBy('createdAt', 'asc'))
  const snap = await getDocs(q)
  return snap.docs.map((d) => mapGuest(d.id, d.data()))
}

// Igual que getAllGuests, pero fusiona guestContacts (email/teléfono) — para
// el único llamador que sí los necesita en una lectura puntual y completa:
// MassMessageComposer.tsx (segmentar audiencia por email requiere saber
// quién tiene uno). Reutiliza fetchContactsByIds (mismo chunking de 30 que ya
// usa subscribeToGuests) en vez de reabrir un listener con límite.
export async function getAllGuestsWithContacts(eventId: string): Promise<GuestData[]> {
  const guests = await getAllGuests(eventId)
  const contacts = await fetchContactsByIds(eventId, guests.map((g) => g.id))
  return guests.map((g) => ({
    ...g,
    phone: contacts[g.id]?.phone || g.phone,
    phoneCountry: contacts[g.id]?.phoneCountry || g.phoneCountry,
    email: contacts[g.id]?.email || g.email,
  }))
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

// Transacción (no updateDoc suelto) porque además de escribir rsvpStatus en
// el invitado, mueve el contador del evento del balde VIEJO al NUEVO
// (rsvpYesCount/rsvpNoCount/rsvpPendingCount, ver rsvpCountField) — necesita
// leer el rsvpStatus actual de forma atómica con esa escritura para no
// perder un delta si dos cambios de RSVP casi simultáneos leyeran el mismo
// valor viejo (auditoría F22).
export async function setGuestRsvp(eventId: string, qrToken: string, rsvpStatus: RsvpStatus) {
  const guestRef = await findGuestRefByToken(eventId, qrToken)
  if (!guestRef) return
  const eventRef = doc(db, 'events', eventId)
  const notify = await runTransaction(db, async (transaction) => {
    const [guestSnap, eventSnap] = await Promise.all([transaction.get(guestRef), transaction.get(eventRef)])
    if (!guestSnap.exists()) return null
    const oldRsvp = (guestSnap.data().rsvpStatus as RsvpStatus) || 'pending'
    transaction.update(guestRef, { rsvpStatus })
    let notifyResult: { ownerId: string; eventName: string; guestName: string } | null = null
    if (oldRsvp !== rsvpStatus) {
      transaction.update(eventRef, {
        [rsvpCountField(oldRsvp)]: increment(-1),
        [rsvpCountField(rsvpStatus)]: increment(1),
      })
      // Solo 'pending' -> 'yes'/'no' notifica (una respuesta nueva, de
      // verdad accionable) — un invitado que cambia de 'yes' a 'no' o
      // viceversa ya había notificado una vez, y evita duplicar avisos por
      // cada ida y vuelta.
      if (oldRsvp === 'pending' && rsvpStatus !== 'pending') {
        const eventData = eventSnap.data()
        if (eventData?.ownerId) {
          notifyResult = { ownerId: eventData.ownerId as string, eventName: (eventData.name as string) || '', guestName: (guestSnap.data().name as string) || '' }
        }
      }
    }
    return notifyResult
  })
  if (notify) {
    const verb = rsvpStatus === 'yes' ? 'confirmó su asistencia a' : 'avisó que no podrá asistir a'
    enqueueNotification({
      eventId,
      type: 'rsvp_new',
      recipientUid: notify.ownerId,
      payload: { title: 'Nueva respuesta de RSVP', body: `${notify.guestName} ${verb} ${notify.eventName}.`, deepLink: `/events/${eventId}` },
    }).catch((err) => console.error('Error encolando notificación de RSVP:', err))
  }
}

// Mismo motivo de transacción que setGuestRsvp — necesita el rsvpStatus
// VIEJO del invitado para saber qué contador del evento decrementar antes de
// resetearlo a 'pending'.
export async function resetGuestRsvp(eventId: string, guestId: string) {
  const guestRef = doc(db, 'events', eventId, 'guests', guestId)
  const eventRef = doc(db, 'events', eventId)
  await runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) return
    const oldRsvp = (guestSnap.data().rsvpStatus as RsvpStatus) || 'pending'
    transaction.update(guestRef, { rsvpStatus: 'pending', lockToken: null, lockTokens: [] })
    if (oldRsvp !== 'pending') {
      transaction.update(eventRef, {
        [rsvpCountField(oldRsvp)]: increment(-1),
        rsvpPendingCount: increment(1),
      })
    }
  })
}

// A diferencia de resetGuestRsvp, NO toca el RSVP — solo libera el pase para
// que pueda abrirse desde otro dispositivo (invitado que cambió de teléfono,
// borró el navegador, o lo abrió por error desde el dispositivo equivocado).
export async function unlockGuestPass(eventId: string, guestId: string) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { lockToken: null, lockTokens: [] })
}

// Acción del ORGANIZADOR: aprobar (`'paid'`) o revertir/rechazar (`'unpaid'`)
// el pago de un invitado — botón "Marcar como pagado/no pagado" en
// GuestList/GuestPass, y también "Aprobar pago"/"Rechazar comprobante"
// cuando está en `pending_confirmation` (ver submitPaymentProof más abajo).
// `method` es opcional: si no se pasa, se conserva el que ya tenía el
// invitado.
//
// Toda la máquina de estados (paidCount, paidAt/paidBy, idempotencia) vive
// en la Cloud Function `setGuestPaymentStatus` (Admin SDK, ver
// functions/src/payments/confirmPayment.ts) — este archivo ya no escribe
// paymentStatus/paymentMethod/paidAt/paidBy directo a Firestore, firestore.rules
// tampoco lo permite. Solo se invoca la Callable y se propaga cualquier error.
export async function setGuestPaymentStatus(
  eventId: string,
  guestId: string,
  paymentStatus: 'paid' | 'unpaid',
  method?: PaymentMethod,
) {
  const callable = httpsCallable<
    { eventId: string; guestId: string; paymentStatus: 'paid' | 'unpaid'; method?: PaymentMethod },
    { ok: boolean }
  >(functions, 'setGuestPaymentStatus')
  await callable({ eventId, guestId, paymentStatus, method })
}

// Acción del INVITADO: "Ya pagué / Comprobante enviado" (GuestPass). Solo
// tiene sentido para transferencia — efectivo no tiene nada que "confirmar"
// de antemano, se paga presencialmente. Sin límite de tiempo: puede mandarlo
// cuando quiera mientras no esté ya pagado ni ya tenga un comprobante en
// revisión (cualquier otro valor, incluido el legacy 'expired', cuenta como
// "puede enviar"). No toca el cupo del evento en ningún caso — el invitado
// ya contaba desde que se registró.
//
// `note` (número de referencia de la transferencia) es obligatorio: sin él,
// el organizador no tiene nada concreto que cotejar contra su resumen
// bancario y "ya pagué" se vuelve una declaración sin forma de verificarla.
// Mismo requisito reforzado en firestore.rules (ver isValidPublicGuestRegistration
// y la rama de update de guests/{guestId} ahí) para que no se pueda saltear
// llamando a Firestore directo.
export async function submitPaymentProof(eventId: string, guestId: string, note: string) {
  const trimmedNote = requireMaxLength(requireNonEmpty(note, 'El número de referencia'), 300, 'El número de referencia')
  const guestRef = doc(db, 'events', eventId, 'guests', guestId)

  await runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) return
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    if (guest.paymentMethod !== 'transfer') return
    if (guest.paymentStatus === 'paid' || guest.paymentStatus === 'pending_confirmation') return

    transaction.update(guestRef, {
      paymentStatus: 'pending_confirmation',
      paymentNote: trimmedNote,
    })
  })
}

// Puede el invitado mandar/re-mandar su comprobante ahora mismo — solo
// transferencia, y solo si no está ya pagado ni ya en revisión. Sin límite
// de tiempo (ver submitPaymentProof). Movida acá desde utils/reservation.ts
// al eliminar el "apartado temporal de lugar" (ya no depende del reloj).
export function canSubmitPaymentProof(guest: Pick<GuestData, 'paymentMethod' | 'paymentStatus'>): boolean {
  return guest.paymentMethod === 'transfer'
    && guest.paymentStatus !== 'paid'
    && guest.paymentStatus !== 'pending_confirmation'
}

// Cuántos dispositivos distintos puede reconocer un mismo pase antes de
// empezar a "rotar" el más viejo (ver claimGuestPass). Un pase familiar
// tiene un tope mayor porque es normal que varios integrantes reales lo
// abran cada uno por su cuenta. Debe coincidir con el tope espejado en
// firestore.rules (rama de update de guests/{guestId}).
const INDIVIDUAL_DEVICE_CAP = 3
const GROUP_DEVICE_CAP = 8

/**
 * Reconoce `deviceToken` como uno de los dispositivos habilitados para
 * escribir sobre ESTE pase (RSVP, comprobante de pago, auto-edición).
 *
 * A diferencia del esquema anterior (un solo dispositivo "ganaba" la
 * primera carrera y el resto quedaba bloqueado para siempre), acepta una
 * lista acotada de dispositivos — pensado para el caso normal de un
 * invitado que abre el link desde el navegador interno de Instagram/
 * TikTok/WhatsApp/Telegram (storage aislado del Safari/Chrome del
 * sistema, ver src/utils/inAppBrowser.ts) y después lo vuelve a abrir
 * desde su navegador real. Si se llega al tope, se expulsa el
 * dispositivo más viejo (LRU) en vez de rechazar al nuevo — nunca deja
 * al invitado sin acceso de escritura a su propio pase; el organizador
 * sigue viendo cuántos dispositivos distintos hay (GuestDetailSheet) por
 * si eso indica que el link se compartió de más.
 *
 * Devuelve la lista resultante de dispositivos reconocidos; el llamador
 * decide si mostrar un aviso (no bloqueante) cuando hay más de uno.
 */
export async function claimGuestPass(eventId: string, guestId: string, deviceToken: string): Promise<string[]> {
  const guestRef = doc(db, 'events', eventId, 'guests', guestId)
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(guestRef)
    if (!snap.exists()) return [deviceToken]

    const data = snap.data()
    const existing: string[] = Array.isArray(data.lockTokens)
      ? (data.lockTokens as string[])
      : (data.lockToken ? [data.lockToken as string] : [])

    if (existing.includes(deviceToken)) return existing

    const cap = data.isGroup ? GROUP_DEVICE_CAP : INDIVIDUAL_DEVICE_CAP
    const next = [...existing, deviceToken].slice(-cap)
    transaction.update(guestRef, { lockTokens: next, lockToken: next[next.length - 1] })
    return next
  })
}

// Vincula este pase a la cuenta autenticada que lo está viendo — el único
// campo que hace de un invitado "recuperable desde cualquier dispositivo"
// (ver GuestPass.tsx, y el problema que resuelve: un navegador integrado de
// Instagram/TikTok/Facebook que borra localStorage antes de que el invitado
// vuelva a abrir el link desde su navegador real). "Primero en reclamarlo,
// gana": no hace nada si el pase ya tiene DUEÑO (mismo uid o distinto) — un
// pase ya vinculado nunca se puede reasignar desde acá; ver
// reclaimInvitationsByEmail (src/firebase/invitationRecovery.ts) para el
// camino de recuperación cuando el invitado ni siquiera tiene el link. La
// prueba de "posesión del pase" acá es la misma que ya protege el resto de
// acciones del invitado en firestore.rules: haber resuelto este (eventId,
// guestId) en primer lugar (un id aleatorio de Firestore, no adivinable) —
// no depende de lockToken (ver el comentario de esta rama en firestore.rules
// sobre por qué reenviar un valor sin cambiarlo no prueba nada).
export async function claimGuestOwnership(
  eventId: string,
  guestId: string,
  uid: string,
  currentGuestUid: string | null,
): Promise<void> {
  if (currentGuestUid === uid) return
  try {
    await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { guestUid: uid })
  } catch (err) {
    // Ya reclamado por otra cuenta — no debe interrumpir la carga del pase,
    // que sigue funcionando igual sin este vínculo (users/{uid}/invitations,
    // escrito aparte, no depende de esto).
    console.warn('No se pudo vincular el pase a la cuenta:', err)
  }
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

// Toda la máquina de estados (guestPresence, gate de pago, escritura
// combinada de guests/{guestId}+events/{eventId}, doc de auditoría en
// checkins) vive en la Cloud Function `checkInGuest` (Admin SDK, ver
// functions/src/checkin/checkIn.ts) — este archivo ya no corre la
// transacción, solo invoca la Callable y propaga el resultado.
export async function checkInGuest(
  eventId: string,
  qrToken: string,
): Promise<CheckInResult> {
  const callable = httpsCallable<{ eventId: string; qrToken: string }, CheckInResult>(functions, 'checkInGuest')
  const result = await measureSpan('functions.checkInGuest', 'db.firestore', () => callable({ eventId, qrToken }))
  return result.data
}

export type CheckOutResult =
  | { status: 'success'; guest: GuestData; kind: 'temporary' | 'final' }
  | { status: 'not_checked_in' }
  | { status: 'already_checked_out'; guest: GuestData }
  | { status: 'not_found' }

// Misma máquina de estados que checkInGuest, ahora en la Cloud Function
// `checkOutGuest` (ver functions/src/checkin/checkOut.ts).
export async function checkOutGuest(
  eventId: string,
  qrToken: string,
  kind: 'temporary' | 'final',
): Promise<CheckOutResult> {
  const callable = httpsCallable<{ eventId: string; qrToken: string; kind: 'temporary' | 'final' }, CheckOutResult>(functions, 'checkOutGuest')
  const result = await measureSpan('functions.checkOutGuest', 'db.firestore', () => callable({ eventId, qrToken, kind }))
  return result.data
}

export type ConfirmPaymentAndCheckInResult =
  | { ok: true; checkIn: 'success'; reentry: boolean; guest: GuestData }
  | { ok: true; checkIn: 'already_checked_in'; guest: GuestData }
  | { ok: true; checkIn: 'blocked_final_exit'; guest: GuestData }

// Botón "Sí, ya pagó" del escáner (evento de pago, invitado sin pagar) —
// confirma el pago y hace el check-in en una sola llamada atómica del
// servidor (ver functions/src/checkin/confirmPaymentAndCheckIn.ts), en vez
// de las dos llamadas secuenciales no atómicas (setGuestPaymentStatus +
// checkInGuest) que este archivo usaba antes de esta migración.
export async function confirmPaymentAndCheckIn(
  eventId: string,
  guestId: string,
  method?: PaymentMethod,
): Promise<ConfirmPaymentAndCheckInResult> {
  const callable = httpsCallable<
    { eventId: string; guestId: string; method?: PaymentMethod },
    ConfirmPaymentAndCheckInResult
  >(functions, 'confirmPaymentAndCheckIn')
  const result = await measureSpan('functions.confirmPaymentAndCheckIn', 'db.firestore', () => callable({ eventId, guestId, method }))
  return result.data
}

// Excepción del organizador (pedida explícitamente): revierte una salida
// "definitiva" a un estado que vuelve a permitir reingreso por escáner —
// limpia `exitType` sin tocar `checkedOutAt` (el invitado sigue figurando
// "afuera" hasta que efectivamente reingrese, checkInGuest se encarga de
// resetear checkedOutAt en ese momento). Cloud Function
// functions/src/callable/allowGuestReentry.ts.
export async function allowGuestReentry(eventId: string, guestId: string) {
  const callable = httpsCallable<{ eventId: string; guestId: string }, { ok: boolean }>(functions, 'allowGuestReentry')
  await callable({ eventId, guestId })
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
      phoneCountry: (c as CompanionData)?.phoneCountry || '',
      menuSelection: (c as CompanionData)?.menuSelection || undefined,
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
    phoneCountry: (data.phoneCountry as string) || '',
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
    lockTokens: Array.isArray(data.lockTokens) ? (data.lockTokens as string[]) : undefined,
    customData: (data.customData as Record<string, string>) || undefined,
    tags: Array.isArray(data.tags) ? (data.tags as string[]) : undefined,
    menuSelection: (data.menuSelection as GuestData['menuSelection']) || undefined,
    paymentStatus: (data.paymentStatus as GuestData['paymentStatus']) || 'unpaid',
    paymentMethod: (data.paymentMethod as GuestData['paymentMethod']) || null,
    paymentNote: (data.paymentNote as string) || undefined,
    // Escritos como número plano (Date.now()) por la Cloud Function
    // setGuestPaymentStatus, no como Timestamp — no pasan por toMillisOrNull.
    paidAt: typeof data.paidAt === 'number' ? data.paidAt : null,
    paidBy: (data.paidBy as string) || null,
    guestUid: (data.guestUid as string) || null,
    guestPhotoURL: (data.guestPhotoURL as string) || null,
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
