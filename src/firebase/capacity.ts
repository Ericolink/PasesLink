import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import { generateQrToken, resolveMaxCompanions } from './guests'
import {
  GUEST_CUSTOM_FIELD_MAX_COUNT,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_FULL_NAME_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
} from '../utils/validation'
import type { PaymentMethod } from '../types'

/**
 * Opción A / C — Incrementa el contador walk-in atómicamente. Respeta el cupo
 * si está definido, comparando contra `occupancyCount` (ocupación en vivo:
 * sube/baja con cualquier ingreso/salida, walk-in o por QR) — NO contra
 * `checkedInCount`, que es asistencia acumulada y nunca baja cuando alguien
 * sale, así que compararlo contra `capacity` seguiría bloqueando nuevos
 * walk-ins aunque el venue ya no esté lleno. `checkedInCount` se sigue
 * incrementando igual, sin cambios, para no afectar las estadísticas de
 * asistencia que ya dependen de él (barra de progreso del Scanner, "Escaneados"
 * en EventDetail).
 */
export async function walkIn(eventId: string): Promise<'success' | 'full'> {
  const eventRef = doc(db, 'events', eventId)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return 'full'
    const data = snap.data()
    const capacity = data.capacity as number | null
    const currentOccupancy = (data.occupancyCount as number) || 0
    if (capacity && currentOccupancy >= capacity) return 'full'
    tx.update(eventRef, { checkedInCount: increment(1), occupancyCount: increment(1) })
    return 'success'
  })
}

/** Opción A — Decrementa el contador walk-in (libera un lugar de ocupación en vivo). */
export async function walkOut(eventId: string): Promise<void> {
  const eventRef = doc(db, 'events', eventId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return
    const data = snap.data()
    const updates: Record<string, unknown> = {}
    if (((data.checkedInCount as number) || 0) > 0) updates.checkedInCount = increment(-1)
    if (((data.occupancyCount as number) || 0) > 0) updates.occupancyCount = increment(-1)
    if (Object.keys(updates).length > 0) tx.update(eventRef, updates)
  })
}

/**
 * Opción B — Crea un invitado al instante (auto-registro público). NUNCA se
 * bloquea por cupo: `capacity` es puramente informativo (ver EventData.capacity
 * y el aviso en EventJoin.tsx cuando peopleCount ya lo superó), no un límite
 * duro — así que esta función no lo consulta en absoluto.
 * Capa de aplicación: no confiar en que la UI ya validó. `name` llega ya
 * combinado por el llamador (EventJoin) como "Nombre Apellido" — por eso se
 * valida contra el máximo combinado, no el de una sola parte. Mismos límites
 * que firestore.rules (ver isValidPublicGuestRegistration ahí).
 *
 * El QR/pase se crea siempre, pague o no — el gate real está en checkInGuest
 * (ver GuestData.paymentStatus, que nunca es 'paid' hasta que el organizador
 * lo confirme). Ya no existe el "apartado temporal de lugar" (cronómetro):
 * el invitado puede subir su comprobante cuando quiera, sin plazo.
 *
 * ADVERTENCIA: esta función abre su propia runTransaction — no se puede
 * llamar desde dentro de otra runTransaction (p.ej. una de guests.ts), eso
 * falla en runtime y TypeScript no lo detecta porque ambas son simplemente
 * funciones que devuelven una Promise. Además, el largo POR VALOR de cada
 * campo de `customData` se valida SOLO acá (el bucle de abajo) — firestore.rules
 * no puede iterar un mapa para revisar el largo de cada valor individual, así
 * que esta es la única barrera real para ese caso. No la quites sin agregar
 * una equivalente en otro lado.
 */
export async function registerWalkInGuest(
  eventId: string,
  name: string,
  email?: string,
  phone?: string,
  customData?: Record<string, string>,
  partySize?: number,
  paymentMethod?: PaymentMethod,
  // Presentes solo si quien se autoregistra está logueado con una cuenta
  // PaseLink (ver EventJoin.tsx) — permiten mostrar su foto real en vez de
  // iniciales en la lista del organizador. Ver firestore.rules,
  // isValidPublicGuestRegistration: guestUid debe ser el uid autenticado del
  // propio request y guestPhotoURL debe coincidir con el de su perfil, así
  // que mandar valores falsos acá no tiene efecto (las reglas lo rechazan).
  guestUid?: string,
  guestPhotoURL?: string,
): Promise<{ status: 'success' | 'error'; qrToken?: string }> {
  const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre')
  const trimmedEmail = email?.trim() ? requireMaxLength(email.trim(), GUEST_EMAIL_MAX, 'El email') : ''
  const trimmedPhone = phone?.trim() ? requireMaxLength(phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
  const customEntries = Object.entries(customData || {})
  if (customEntries.length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new Error('El formulario tiene demasiados campos.')
  }
  for (const [, value] of customEntries) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos del formulario')
  }

  const eventRef = doc(db, 'events', eventId)

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    // Único motivo de fallo posible: el evento se borró entre que se cargó
    // el formulario y se envió el registro — ya no hay ningún chequeo de cupo.
    if (!snap.exists()) return { status: 'error' }
    const data = snap.data()
    const requiresPayment = (data.requiresPayment as boolean) || false
    const resolvedMethod = requiresPayment ? paymentMethod || null : null
    // Clampeado, no rechazado: un valor fuera de rango (incluido undefined,
    // el caso normal para llamadores que no piden acompañantes) cae a un
    // tamaño de grupo válido en vez de romper el registro. El techo es el
    // límite de ESTE evento (EventData.maxCompanions), no un valor global —
    // ver resolveMaxCompanions.
    const maxPartySize = 1 + resolveMaxCompanions({ maxCompanions: data.maxCompanions as number | undefined })
    const clampedPartySize = Math.min(Math.max(Math.trunc(partySize || 1), 1), maxPartySize)

    const qrToken = generateQrToken()
    const guestRef = doc(collection(db, 'events', eventId, 'guests'))
    tx.set(guestRef, {
      name: trimmedName,
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      // Formato numérico legacy (no array de CompanionData) — normalizeCompanions
      // en guests.ts ya sabe traducirlo a `companions.length` al leerlo.
      companions: clampedPartySize - 1,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      notes: '',
      paymentStatus: 'unpaid',
      paymentMethod: resolvedMethod,
      holdExpiresAt: null,
      customData: customData || {},
      guestUid: guestUid || null,
      guestPhotoURL: guestPhotoURL || null,
      createdAt: serverTimestamp(),
    })
    if (trimmedEmail || trimmedPhone) {
      tx.set(doc(db, 'events', eventId, 'guestContacts', guestRef.id), {
        email: trimmedEmail,
        phone: trimmedPhone,
      })
    }
    // Valor absoluto calculado dentro de la transacción, NO increment():
    // eventos creados antes de que existiera peopleCount no tienen ese campo,
    // e increment() lo crearía arrancando de 0, dejando el total inconsistente
    // con lo que la app ya muestra (getEvent en events.ts aproxima el
    // peopleCount ausente con guestCount — mismo fallback de acá). Escribir el
    // valor calculado backfillea el campo legacy con esa misma aproximación, y
    // la transacción garantiza la atomicidad que antes daba increment().
    // firestore.rules aplica este mismo fallback al validar el delta (ver
    // eventPeopleCountBefore ahí).
    const currentGuestCount = typeof data.guestCount === 'number' ? data.guestCount : 0
    const currentPeopleCount = typeof data.peopleCount === 'number' ? data.peopleCount : currentGuestCount
    tx.update(eventRef, {
      guestCount: currentGuestCount + 1,
      peopleCount: currentPeopleCount + clampedPartySize,
    })

    return { status: 'success', qrToken }
  })
}
