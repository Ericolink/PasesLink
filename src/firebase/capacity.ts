import { doc, runTransaction } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from './config'
import { CapacityFullError } from './attendeeLimit'
import { applyCounterDeltas } from './counters'
import {
  GUEST_CUSTOM_FIELD_MAX_COUNT,
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_EMAIL_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  requireMaxLength,
  requireNonEmpty,
} from '../utils/validation'
import type { CompanionData, PaymentMethod } from '../types'

/**
 * Opción A / C — Incrementa el contador walk-in atómicamente. Respeta el cupo
 * si está definido, comparando contra `occupancyCount` (ocupación en vivo:
 * sube/baja con cualquier ingreso/salida, walk-in o por QR) — NO contra
 * `checkedInCount`, que es asistencia acumulada y nunca baja cuando alguien
 * sale, así que compararlo contra `capacity` seguiría bloqueando nuevos
 * walk-ins aunque el venue ya no esté lleno. `checkedInCount` se sigue
 * incrementando igual, sin cambios, para no afectar las estadísticas de
 * asistencia que ya dependen de él (barra de progreso del Scanner, "Escaneados"
 * en EventDetail). `walkInNetCount` (walk-ins netos, nunca negativo) es un
 * ledger aparte: no lo lee ninguna pantalla, existe solo para que
 * reconcileGuestCounters.ts (Cloud Functions) pueda recomponer
 * checkedInCount/occupancyCount como "derivado de guests/ + este ledger" en
 * vez de tener que excluirlos de la reconciliación automática — walkIn/
 * walkOut son la única fuente de esos dos contadores que no crea un
 * documento de invitado, así que no hay otra forma de recuperar ese dato.
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
    applyCounterDeltas(tx, eventRef, { checkedInCount: 1, occupancyCount: 1, walkInNetCount: 1 })
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
    applyCounterDeltas(tx, eventRef, {
      checkedInCount: ((data.checkedInCount as number) || 0) > 0 ? -1 : 0,
      occupancyCount: ((data.occupancyCount as number) || 0) > 0 ? -1 : 0,
      walkInNetCount: ((data.walkInNetCount as number) || 0) > 0 ? -1 : 0,
    })
  })
}

/**
 * Opción B — Crea un invitado al instante (auto-registro público), vía la
 * Callable Function `registerWalkInGuest` (functions/src/callable/
 * registerWalkInGuest.ts) — reemplaza la transacción de cliente que existía
 * antes acá (ver FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md, Fase A). El cálculo
 * de cupo (incluida la cuenta de ofertas activas de lista de espera) y la
 * validación de forma de `customData` ahora corren del lado del servidor,
 * dentro de una única transacción con Admin SDK — dejan de ser best-effort.
 *
 * Validación de forma acá sigue existiendo como fail-fast de UX (evita un
 * viaje de red para errores obvios de tipeo), pero ya no es la barrera de
 * seguridad real — esa vive en la Cloud Function.
 *
 * `guestUid`/`guestPhotoURL` ya no los manda el cliente: la Callable los
 * resuelve del lado del servidor a partir del uid verificado de la sesión (si
 * la hay) y del perfil real en `users/{uid}`.
 *
 * httpsCallable(functions, ...) se construye DENTRO de la función (no a nivel
 * de módulo) por el mismo motivo ya documentado en attendeeLimit.ts
 * (fetchOfferedWaitlistCount): solo IMPORTAR este archivo (p.ej. para usar
 * walkIn/walkOut) no debería disparar la inicialización del SDK de Functions.
 */
export async function registerWalkInGuest(
  eventId: string,
  name: string,
  // Separado de `name` (rediseño del Dashboard del Evento — "unificar
  // requisitos entre Lista y Auto Registro"): antes EventJoin.tsx mandaba
  // nombre+apellido ya concatenados en un solo `name`; ahora se guardan
  // separados, mismo shape que usa el alta manual del organizador.
  lastName?: string,
  email?: string,
  phone?: string,
  customData?: Record<string, string>,
  // Datos reales de cada acompañante (no un conteo) — ver el mismo criterio
  // en RegisterWalkInGuestInput (functions/src/capacity/registerWalkInGuest.ts).
  companions?: CompanionData[],
  paymentMethod?: PaymentMethod,
  // Ya no se usan del lado cliente (ver comentario de arriba) — se conservan
  // en la firma para no tener que tocar el único llamador (EventJoin.tsx) en
  // esta misma migración.
  _guestUid?: string,
  _guestPhotoURL?: string,
  // País (ISO alpha-2) elegido junto al teléfono — ver el mismo campo en
  // GuestData y toWhatsAppPhone (utils/phone.ts).
  phoneCountry?: string,
): Promise<{ status: 'success' | 'error'; qrToken?: string }> {
  const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const trimmedLastName = lastName?.trim() ? requireMaxLength(lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido') : undefined
  const trimmedEmail = email?.trim() ? requireMaxLength(email.trim(), GUEST_EMAIL_MAX, 'El email') : undefined
  const trimmedPhone = phone?.trim() ? requireMaxLength(phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : undefined
  const customEntries = Object.entries(customData || {})
  if (customEntries.length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new Error('El formulario tiene demasiados campos.')
  }
  for (const [, value] of customEntries) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos del formulario')
  }

  const registerWalkInGuestCallable = httpsCallable<
    {
      eventId: string
      name: string
      lastName?: string
      email?: string
      phone?: string
      phoneCountry?: string
      customData?: Record<string, string>
      companions?: CompanionData[]
      paymentMethod?: PaymentMethod
    },
    { status: 'success'; qrToken: string } | { status: 'full' } | { status: 'error' }
  >(functions, 'registerWalkInGuest')

  const result = await registerWalkInGuestCallable({
    eventId,
    name: trimmedName,
    lastName: trimmedLastName,
    email: trimmedEmail,
    phone: trimmedPhone,
    phoneCountry,
    customData,
    companions,
    paymentMethod,
  })

  if (result.data.status === 'full') throw new CapacityFullError()
  if (result.data.status === 'error') return { status: 'error' }
  return { status: 'success', qrToken: result.data.qrToken }
}
