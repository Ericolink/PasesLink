// Servicio puro de auto-registro público (Opción B) — Admin SDK, sin
// HttpsError ni chequeo de permisos acá (eso vive en la Callable que lo
// invoca, ver callable/registerWalkInGuest.ts). Puerto de registerWalkInGuest()
// en src/firebase/capacity.ts, misma máquina de estados, con dos mejoras que
// solo son posibles del lado del servidor:
//
// 1. El conteo de ofertas activas de lista de espera (offeredCount) se lee
//    DENTRO de esta misma transacción (el Admin SDK sí puede correr una
//    aggregate query dentro de una runTransaction — ver
//    functions/src/waitlist/promote.ts) en vez de antes de abrirla: el
//    chequeo de cupo deja de ser best-effort y pasa a ser atómico de verdad.
// 2. `guestUid`/`guestPhotoURL` se resuelven acá desde el request verificado
//    y el perfil real (`users/{uid}`) — nunca desde valores que mande el
//    cliente, así que no hace falta que ninguna regla los revalide.
import { AggregateField, FieldValue, type Firestore } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { hasCapacityFor } from '../lib/attendeeLimit.js'
import { applyCounterDeltas } from '../lib/counters/index.js'
import {
  type CustomFieldDef,
  GUEST_EMAIL_MAX,
  GUEST_FULL_NAME_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  resolveMaxCompanions,
  validatePublicCustomData,
} from '../lib/guestValidation.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'

// Clampeado, no rechazado — mismo criterio que el cliente hoy: un valor
// fuera de rango (incluido ausente) cae a un tamaño de grupo válido en vez
// de romper el registro. Un valor que ni siquiera es un número (payload
// manipulado a mano, ej. partySize: "muchos") sí se rechaza — de lo
// contrario Math.trunc()/Math.max() lo convierten en NaN, que después
// contamina companions y el contador peopleCount del evento en Firestore.
function resolvePartySize(rawPartySize: unknown, maxPartySize: number): number {
  if (rawPartySize === undefined || rawPartySize === null) return 1
  if (typeof rawPartySize !== 'number' || !Number.isFinite(rawPartySize)) {
    throw new GuestValidationError('La cantidad de personas no es válida.')
  }
  return Math.min(Math.max(Math.trunc(rawPartySize), 1), maxPartySize)
}

// El cliente nunca decide por sí mismo con qué método quedó el registro:
// requiresPayment y la lista de métodos habilitados (event.paymentMethods)
// son configuración del organizador, así que un paymentMethod que no esté
// en esa lista se rechaza en vez de guardarse tal cual. Con un solo método
// habilitado, el organizador espera que el registro público funcione sin
// que el invitado tenga que elegir nada (mismo criterio que EventJoin.tsx,
// que en ese caso ni le muestra el selector) — se completa solo.
function resolvePaymentMethod(
  requiresPayment: boolean,
  allowedMethods: PaymentMethod[] | undefined,
  candidate: PaymentMethod | undefined,
): PaymentMethod | null {
  if (!requiresPayment) return null
  const allowed = allowedMethods || []
  if (candidate && allowed.includes(candidate)) return candidate
  if (!candidate && allowed.length === 1) return allowed[0]
  throw new GuestValidationError('Elige un método de pago válido para este evento.')
}

export interface RegisterWalkInGuestInput {
  name: string
  email?: string
  phone?: string
  phoneCountry?: string
  customData?: Record<string, string>
  partySize?: number
  paymentMethod?: PaymentMethod
  // uid del request.auth verificado de la Callable, si lo hay — nunca un
  // valor que mande el cliente en el body (ver comentario de archivo).
  authUid?: string | null
}

export type RegisterWalkInGuestResult =
  | { status: 'success'; guestId: string; qrToken: string; eventName: string; email: string }
  | { status: 'full' }
  | { status: 'event_not_found' }
  | { status: 'not_open' }

function generateQrToken(): string {
  return randomUUID().replace(/-/g, '')
}

export async function registerWalkInGuest(
  db: Firestore,
  eventId: string,
  input: RegisterWalkInGuestInput,
): Promise<RegisterWalkInGuestResult> {
  const trimmedName = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre')
  // Minúsculas: permite encontrar este contacto más tarde por igualdad exacta
  // contra el email verificado de Firebase Auth (ver la misma normalización
  // en src/firebase/capacity.ts).
  const trimmedEmail = input.email?.trim()
    ? requireMaxLength(input.email.trim().toLowerCase(), GUEST_EMAIL_MAX, 'El email')
    : ''
  const trimmedPhone = input.phone?.trim() ? requireMaxLength(input.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''

  const eventRef = db.collection('events').doc(eventId)
  const guestsCol = eventRef.collection('guests')
  const waitlistCol = eventRef.collection('waitlist')

  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    if (!eventSnap.exists) return { status: 'event_not_found' }
    const event = eventSnap.data()!

    const entryMode = event.entryMode as string | undefined
    if (entryMode !== 'open' && entryMode !== 'hybrid') return { status: 'not_open' }

    // Contra la definición REAL de campos del evento, nunca contra lo que
    // el cliente diga que son sus campos — ver validatePublicCustomData.
    const customData = validatePublicCustomData(input.customData, event.customFields as CustomFieldDef[] | undefined)

    let offeredCount = 0
    if (event.attendeeLimitEnabled === true) {
      const offeredAgg = await tx.get(
        waitlistCol.where('status', '==', 'offered').aggregate({ total: AggregateField.sum('partySize') }),
      )
      offeredCount = offeredAgg.data().total ?? 0
    }

    let guestPhotoURL: string | null = null
    if (input.authUid) {
      const userSnap = await tx.get(db.collection('users').doc(input.authUid))
      guestPhotoURL = (userSnap.data()?.photoURL as string | undefined) ?? null
    }

    const maxPartySize = 1 + resolveMaxCompanions(event.maxCompanions as number | undefined)
    const clampedPartySize = resolvePartySize(input.partySize, maxPartySize)

    const currentGuestCount = typeof event.guestCount === 'number' ? event.guestCount : 0
    const currentPeopleCount = typeof event.peopleCount === 'number' ? event.peopleCount : currentGuestCount

    const requiresPayment = (event.requiresPayment as boolean) || false
    const resolvedMethod = resolvePaymentMethod(requiresPayment, event.paymentMethods as PaymentMethod[] | undefined, input.paymentMethod)

    if (
      !hasCapacityFor(
        { attendeeLimitEnabled: event.attendeeLimitEnabled as boolean | undefined, peopleCount: currentPeopleCount, capacity: event.capacity as number | undefined },
        clampedPartySize,
        offeredCount,
      )
    ) {
      return { status: 'full' }
    }

    const qrToken = generateQrToken()
    const guestRef = guestsCol.doc()
    tx.set(guestRef, {
      name: trimmedName,
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      // Formato numérico legacy — normalizeCompanions (cliente) sabe traducirlo.
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
      customData,
      guestUid: input.authUid || null,
      guestPhotoURL,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (trimmedEmail || trimmedPhone) {
      tx.set(eventRef.collection('guestContacts').doc(guestRef.id), {
        email: trimmedEmail,
        phone: trimmedPhone,
        ...(trimmedPhone && input.phoneCountry ? { phoneCountry: input.phoneCountry } : {}),
        // El propio invitado tecleó este teléfono al autoregistrarse — base
        // válida para WhatsApp transaccional sobre este evento (ver
        // GuestData.whatsappConsent, src/types/index.ts).
        ...(trimmedPhone ? { whatsappConsent: true } : {}),
      })
    }

    // guestCount/peopleCount van como valor absoluto en `extraFields`, no
    // como delta de applyCounterDeltas: mismo motivo ya documentado en
    // src/firebase/capacity.ts (eventos legacy sin peopleCount/guestCount no
    // deben terminar en un total inconsistente con lo que ya muestra la
    // app) — un `increment()` sobre un campo ausente arrancaría en 0, no en
    // `currentGuestCount`, perdiendo el fallback. rsvpYesCount sí es un
    // delta puro, así que ese sí pasa por el registro de contadores (queda
    // listo para shardearse si hace falta; guestCount/peopleCount NO, hasta
    // que este call site puntual se revise — ver docs/sharded-counters.md).
    applyCounterDeltas(db, tx, eventRef, eventId, { rsvpYesCount: 1 }, {
      guestCount: currentGuestCount + 1,
      peopleCount: currentPeopleCount + clampedPartySize,
    })

    return { status: 'success', guestId: guestRef.id, qrToken, eventName: (event.name as string) || 'tu evento', email: trimmedEmail }
  })
}
