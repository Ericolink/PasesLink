import {
  collection,
  doc,
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
import { db } from './config'
import { measureSpan, withListenerReporting } from '../lib/sentry'
import type { CompanionData, CustomField, GuestData, PaymentMethod, RsvpStatus } from '../types'
import { GuestSchema, warnIfInvalidShape } from '../types/schemas'
import {
  GUEST_CUSTOM_FIELD_MAX_COUNT,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_FULL_NAME_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
  requireValidEmail,
} from '../utils/validation'

export interface NewGuestInput {
  name: string
  lastName?: string
  phone?: string
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

// Registro nunca se bloquea por cupo (capacity es puramente informativo, ver
// EventData.capacity) — el invitado siempre se crea.
export async function addGuest(eventId: string, input: NewGuestInput): Promise<{ id: string }> {
  const name = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const lastName = input.lastName
    ? requireMaxLength(input.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
    : ''
  const phone = input.phone ? requireMaxLength(input.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
  for (const value of Object.values(input.customData || {})) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos personalizados')
  }

  return measureSpan('firestore.addGuest', 'db.firestore', async () => {
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

export async function addGuestsBulk(eventId: string, names: string[]) {
  // Se valida la lista completa ANTES de escribir el primer chunk: si un solo
  // nombre es inválido, ningún chunk se guarda — evita el caso de un alta
  // parcial (algunos guests ya creados) por un error en una línea cualquiera
  // de la lista pegada.
  const trimmedNames = names.map((name) =>
    requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre'),
  )
  await measureSpan('firestore.addGuestsBulk', 'db.firestore', async () => {
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
export async function addGuestsFromRows(eventId: string, rows: ImportedGuestRow[]) {
  const validated = rows.map((row) => ({
    name: requireMaxLength(requireNonEmpty(row.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre'),
    lastName: row.lastName?.trim() ? requireMaxLength(row.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido') : '',
    phone: row.phone?.trim() ? requireMaxLength(row.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : '',
    email: row.email?.trim() ? requireMaxLength(requireValidEmail(row.email.trim(), 'El email'), GUEST_EMAIL_MAX, 'El email') : '',
  }))

  await measureSpan('firestore.addGuestsFromRows', 'db.firestore', async () => {
    for (let i = 0; i < validated.length; i += BULK_CHUNK_SIZE) {
      const slice = validated.slice(i, i + BULK_CHUNK_SIZE)
      const batch = writeBatch(db)
      for (const row of slice) {
        const guestRef = doc(collection(db, 'events', eventId, 'guests'))
        batch.set(guestRef, buildNewGuestPayload({ name: row.name, lastName: row.lastName }))
        if (row.phone || row.email) {
          const contact: Record<string, string> = {}
          if (row.phone) contact.phone = row.phone
          if (row.email) contact.email = row.email
          batch.set(contactRef(eventId, guestRef.id), contact)
        }
      }
      batch.update(doc(db, 'events', eventId), {
        guestCount: increment(slice.length),
        peopleCount: increment(slice.length),
      })
      await batch.commit()
    }
  })
}

export interface UpdateGuestInput {
  name?: string
  lastName?: string
  phone?: string
  companions?: CompanionData[]
  customData?: Record<string, string>
}

export async function updateGuest(eventId: string, guestId: string, input: UpdateGuestInput) {
  const { phone, ...guestFields } = input

  // Si `companions` cambia de largo (acompañantes agregados/quitados, o
  // cantidad de integrantes editada en una familia), partySize() de este
  // invitado cambia — hay que ajustar peopleCount (y paidCount, si ya había
  // pagado) por la diferencia exacta, en la misma transacción que guarda el
  // nuevo array, para que no quede desalineado con la suma real de personas
  // del evento.
  if (guestFields.companions !== undefined) {
    const guestRef = doc(db, 'events', eventId, 'guests', guestId)
    const eventRef = doc(db, 'events', eventId)
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(guestRef)
      if (!snap.exists()) return
      const existing = mapGuest(snap.id, snap.data())
      const before = partySize(existing)
      const after = 1 + guestFields.companions!.length
      transaction.update(guestRef, { ...guestFields })
      if (phone !== undefined) {
        transaction.set(contactRef(eventId, guestId), { phone }, { merge: true })
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
    batch.set(contactRef(eventId, guestId), { phone }, { merge: true })
  }
  await batch.commit()
}

export interface GuestSelfEditInput {
  name: string
  lastName: string
  phone: string
  email: string
  companions: CompanionData[]
  customData: Record<string, string>
}

// Lee email/phone actuales para precargar el formulario de auto-edición
// (GuestEditModal). Se llama recién al abrir el modal, no en la carga
// inicial del pase, para no gastar una lectura extra en cada visita de
// invitados que nunca editan. Si el invitado nunca tuvo contacto cargado
// (p.ej. de lista, agregado sin teléfono), devuelve strings vacíos.
export async function getGuestContact(eventId: string, guestId: string): Promise<{ email: string; phone: string }> {
  const snap = await getDoc(contactRef(eventId, guestId))
  const data = snap.data()
  return { email: (data?.email as string) || '', phone: (data?.phone as string) || '' }
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
  const emailTrimmed = (input.email || '').trim()
  const email = emailTrimmed
    ? requireMaxLength(requireValidEmail(emailTrimmed, 'El email'), GUEST_EMAIL_MAX, 'El email')
    : ''

  const companions = input.companions.map((c, i) => ({
    name: requireMaxLength((c.name || '').trim(), GUEST_NAME_PART_MAX, `El nombre del acompañante ${i + 1}`),
    lastName: requireMaxLength((c.lastName || '').trim(), GUEST_NAME_PART_MAX, `El apellido del acompañante ${i + 1}`),
    phone: requireMaxLength((c.phone || '').trim(), GUEST_PHONE_MAX, `El teléfono del acompañante ${i + 1}`),
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
    lockToken,
  })
  batch.set(contactRef(eventId, guestId), { email, phone, lockToken }, { merge: true })
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
  guest: Pick<GuestData, 'id' | 'status' | 'companions' | 'checkedOutAt' | 'exitType' | 'paymentStatus'>,
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
  if (guest.paymentStatus === 'paid') {
    updates.paidCount = increment(-size)
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
    withListenerReporting('guests', onError),
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
    withListenerReporting('guestContacts', onError),
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
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { rsvpStatus: 'pending', lockToken: null, lockTokens: [] })
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
// Nunca toca guestCount/peopleCount: el invitado ya cuenta desde que se
// registró, pague o no (capacity es solo informativo). Lo único que cambia
// es `paidCount` (personas), y solo en la transición real de pagado <->
// no pagado — aprobar un pago ya aprobado o revertir uno que nunca se
// aprobó no debe mover el contador. Un invitado legacy en `paymentStatus:
// 'expired'` (valor que este código ya no escribe, ver GuestPaymentStatus)
// se trata igual que uno `unpaid`: puede aprobarse sin ningún chequeo de
// cupo, ya que el cupo nunca lo había perdido.
export async function setGuestPaymentStatus(
  eventId: string,
  guestId: string,
  paymentStatus: 'paid' | 'unpaid',
  method?: PaymentMethod,
) {
  const guestRef = doc(db, 'events', eventId, 'guests', guestId)
  const eventRef = doc(db, 'events', eventId)

  await runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) return
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    const wasPaid = guest.paymentStatus === 'paid'

    const updates: Record<string, unknown> = { paymentStatus }
    if (method !== undefined) updates.paymentMethod = method

    if (paymentStatus === 'paid' && !wasPaid) {
      transaction.update(eventRef, { paidCount: increment(partySize(guest)) })
    } else if (paymentStatus === 'unpaid' && wasPaid) {
      transaction.update(eventRef, { paidCount: increment(-partySize(guest)) })
    }
    // paid -> paid (solo cambia método) y no-pagado (unpaid/pending_confirmation/
    // legacy 'expired') -> unpaid: no-op sobre paidCount.

    transaction.update(guestRef, updates)
  })
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

  return measureSpan('firestore.checkInGuest', 'db.firestore', () => runTransaction(db, async (transaction) => {
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
  }))
}

// Fusión de setGuestPaymentStatus + checkInGuest en UNA sola transacción —
// botón "Sí, ya pagó" del escáner (invitado no pagado en un evento de pago).
// Firestore no permite dos transaction.update() separados sobre el mismo doc
// dentro de la misma transacción, así que acá se combinan los campos de
// ambas operaciones en un único update por doc. `wasPaid` se relee dentro de
// la transacción para no duplicar paidCount si el pago ya se había aprobado
// desde otra pantalla mientras el diálogo estaba abierto.
export type ConfirmPaymentAndCheckInResult =
  | { status: 'success'; guest: GuestData; reentry: boolean }
  | { status: 'already_checked_in'; guest: GuestData }
  | { status: 'blocked_final_exit'; guest: GuestData }
  | { status: 'not_found' }

export async function confirmPaymentAndCheckIn(
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
  method?: PaymentMethod,
): Promise<ConfirmPaymentAndCheckInResult> {
  const guestRef = await findGuestRefByToken(eventId, qrToken)
  if (!guestRef) {
    return { status: 'not_found' }
  }

  const eventRef = doc(db, 'events', eventId)

  return measureSpan('firestore.confirmPaymentAndCheckIn', 'db.firestore', () => runTransaction(db, async (transaction) => {
    const guestSnap = await transaction.get(guestRef)
    if (!guestSnap.exists()) {
      return { status: 'not_found' } as ConfirmPaymentAndCheckInResult
    }
    const guest = mapGuest(guestSnap.id, guestSnap.data())
    const presence = guestPresence(guest)
    if (presence === 'inside') {
      return { status: 'already_checked_in', guest } as ConfirmPaymentAndCheckInResult
    }
    if (presence === 'final_out') {
      return { status: 'blocked_final_exit', guest } as ConfirmPaymentAndCheckInResult
    }
    const isReentry = presence === 'temp_out'
    const wasPaid = guest.paymentStatus === 'paid'

    const guestUpdates: Record<string, unknown> = {
      paymentStatus: 'paid',
      status: 'checked_in',
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      ...(isReentry ? {} : { checkedInAt: serverTimestamp(), checkedInBy: scannedBy, checkedInByEmail: scannedByEmail }),
    }
    if (method !== undefined) guestUpdates.paymentMethod = method
    transaction.update(guestRef, guestUpdates)

    transaction.update(eventRef, {
      occupancyCount: increment(partySize(guest)),
      ...(isReentry ? {} : { checkedInCount: increment(partySize(guest)) }),
      ...(wasPaid ? {} : { paidCount: increment(partySize(guest)) }),
    })

    const checkinRef = doc(collection(db, 'events', eventId, 'checkins'))
    transaction.set(checkinRef, {
      guestId: guest.id,
      guestName: guest.name,
      type: 'check_in',
      ...(isReentry ? { reentry: true } : {}),
      paymentConfirmed: true,
      timestamp: serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: { ...guest, paymentStatus: 'paid', status: 'checked_in', checkedOutAt: null, exitType: null },
      reentry: isReentry,
    } as ConfirmPaymentAndCheckInResult
  }))
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

  return measureSpan('firestore.checkOutGuest', 'db.firestore', () => runTransaction(db, async (transaction) => {
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
  }))
}

// Excepción del organizador (pedida explícitamente): revierte una salida
// "definitiva" a un estado que vuelve a permitir reingreso por escáner —
// limpia `exitType` sin tocar `checkedOutAt` (el invitado sigue figurando
// "afuera" hasta que efectivamente reingrese, checkInGuest se encarga de
// resetear checkedOutAt en ese momento).
export async function allowGuestReentry(eventId: string, guestId: string) {
  await updateDoc(doc(db, 'events', eventId, 'guests', guestId), { exitType: null })
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
    lockTokens: Array.isArray(data.lockTokens) ? (data.lockTokens as string[]) : undefined,
    customData: (data.customData as Record<string, string>) || undefined,
    paymentStatus: (data.paymentStatus as GuestData['paymentStatus']) || 'unpaid',
    paymentMethod: (data.paymentMethod as GuestData['paymentMethod']) || null,
    paymentNote: (data.paymentNote as string) || undefined,
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
