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
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  resolveMaxCompanions,
  validatePublicCompanions,
  validatePublicCustomData,
} from '../lib/guestValidation.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'

// El cliente nunca decide por sí mismo con qué método quedó el registro:
// requiresPayment y la lista de métodos habilitados (event.paymentMethods)
// son configuración del organizador, así que un paymentMethod que no esté
// en esa lista se rechaza en vez de guardarse tal cual. Con un solo método
// habilitado, el organizador espera que el registro público funcione sin
// que el invitado tenga que elegir nada (mismo criterio que EventJoin.tsx,
// que en ese caso ni le muestra el selector) — se completa solo. Con dos
// métodos habilitados ya NO se exige elegir uno al registrarse (el invitado
// ve ambas instrucciones en su pase y paga como prefiera) — queda `null`
// hasta que quien confirme el pago (caja/organizador) registre cuál usó.
function resolvePaymentMethod(
  requiresPayment: boolean,
  allowedMethods: PaymentMethod[] | undefined,
  candidate: PaymentMethod | undefined,
): PaymentMethod | null {
  if (!requiresPayment) return null
  const allowed = allowedMethods || []
  if (candidate && !allowed.includes(candidate)) {
    throw new GuestValidationError('Elige un método de pago válido para este evento.')
  }
  if (candidate) return candidate
  if (allowed.length === 1) return allowed[0]
  return null
}

export interface RegisterWalkInGuestInput {
  name: string
  // Separado de `name` (rediseño del Dashboard del Evento — "unificar
  // requisitos entre Lista y Auto Registro"): antes se guardaba un solo
  // `name` con nombre+apellido concatenados, distinto del shape que usa el
  // alta manual del organizador (name + lastName separados). Ahora ambos
  // flujos escriben el mismo shape de documento.
  lastName?: string
  email?: string
  phone?: string
  phoneCountry?: string
  customData?: Record<string, string>
  // Datos reales de cada acompañante (nombre/apellido/teléfono/customData),
  // no un conteo — el tamaño del grupo se deriva de este array
  // (1 + companions.length), nunca de un `partySize` aparte que pudiera
  // desincronizarse de los datos que realmente se guardan. Validado contra
  // la definición real del evento en validatePublicCompanions, nunca
  // confiado tal cual (ver ese comentario para el porqué).
  companions?: unknown
  paymentMethod?: PaymentMethod
  // uid del request.auth verificado de la Callable, si lo hay — nunca un
  // valor que mande el cliente en el body (ver comentario de archivo).
  authUid?: string | null
  // Clave opaca que el cliente genera una sola vez por intento de registro
  // (ver src/pages/EventJoin.tsx) y reutiliza en cada reintento del MISMO
  // intento (doble-tap, F5 con la petición en vuelo, "no vi respuesta" y
  // reintentar manualmente). No es un identificador de usuario — dos
  // personas distintas pueden mandar claves iguales sin colisionar entre
  // sí porque solo importa dentro de esta transacción (ver más abajo).
  idempotencyKey?: string
}

export type RegisterWalkInGuestResult =
  | { status: 'success'; guestId: string; qrToken: string; eventName: string; email: string }
  | { status: 'full' }
  | { status: 'event_not_found' }
  | { status: 'not_open' }

function generateQrToken(): string {
  return randomUUID().replace(/-/g, '')
}

// Este endpoint es público (sin auth obligatoria), así que idempotencyKey es
// input no confiable — se usa como id de documento de Firestore (doc ID no
// puede contener '/', tiene un tope de 1500 bytes). Un valor fuera de este
// patrón se descarta en silencio (mismo resultado que no haberlo mandado:
// auto-id, sin idempotencia) en vez de rechazar el registro entero por un
// dato que ni siquiera es visible para el invitado.
const IDEMPOTENCY_KEY_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/

function sanitizeIdempotencyKey(key: string | undefined): string | undefined {
  return key && IDEMPOTENCY_KEY_PATTERN.test(key) ? key : undefined
}

export async function registerWalkInGuest(
  db: Firestore,
  eventId: string,
  input: RegisterWalkInGuestInput,
): Promise<RegisterWalkInGuestResult> {
  const trimmedName = requireMaxLength(requireNonEmpty(input.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
  const trimmedLastName = input.lastName?.trim()
    ? requireMaxLength(input.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
    : ''
  // Minúsculas: permite encontrar este contacto más tarde por igualdad exacta
  // contra el email verificado de Firebase Auth (ver la misma normalización
  // en src/firebase/capacity.ts).
  const trimmedEmail = input.email?.trim()
    ? requireMaxLength(input.email.trim().toLowerCase(), GUEST_EMAIL_MAX, 'El email')
    : ''
  const trimmedPhone = input.phone?.trim() ? requireMaxLength(input.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
  const idempotencyKey = sanitizeIdempotencyKey(input.idempotencyKey)

  const eventRef = db.collection('events').doc(eventId)
  const guestsCol = eventRef.collection('guests')
  const waitlistCol = eventRef.collection('waitlist')

  return db.runTransaction(async (tx) => {
    const eventSnap = await tx.get(eventRef)
    if (!eventSnap.exists) return { status: 'event_not_found' }
    const event = eventSnap.data()!

    // 'hybrid' fue un tercer modo ("Ambos") retirado de la app: ya no se puede
    // crear ni elegir, pero eventos viejos pueden seguir teniendo ese valor en
    // Firestore (el frontend lo normaliza a 'open' al leer, pero acá se lee
    // el documento crudo). Se sigue aceptando para no romper el autoregistro
    // de esos eventos existentes — nunca tuvo un comportamiento distinto de
    // 'open' en este flujo.
    const entryMode = event.entryMode as string | undefined
    if (entryMode !== 'open' && entryMode !== 'hybrid') return { status: 'not_open' }

    // Idempotencia por reintento (auditoría de estabilidad, evento en vivo
    // 2026-08-16): mala conexión pierde la respuesta del primer intento →
    // el cliente reintenta con la MISMA clave (ver EventJoin.tsx doRegister)
    // → sin esto, cada reintento crea un guest nuevo. El id del documento es
    // determinístico cuando el cliente manda esta clave, así que un
    // reintento cae sobre el mismo documento en vez de uno nuevo — y como
    // dos transacciones concurrentes no pueden crear ambas el mismo id
    // (Firestore serializa el conflicto y reintenta la perdedora), esto
    // también cubre un verdadero doble-submit concurrente, no solo un
    // reintento secuencial. Se revisa ANTES del chequeo de cupo a propósito:
    // si el primer intento ya tuvo éxito y el evento se llenó después con
    // otras personas, el reintento de ESTE MISMO registro no debe
    // rechazarse como "lleno" — ese cupo ya es suyo. Distinto del dedupe
    // por authUid más abajo (que fusiona acompañantes nuevos, porque ahí sí
    // puede ser una visita distinta en otro momento): acá es la misma
    // llamada repetida, mismos datos, alcanza con devolver el documento ya
    // creado.
    if (idempotencyKey) {
      const idemSnap = await tx.get(guestsCol.doc(idempotencyKey))
      if (idemSnap.exists) {
        const existingData = idemSnap.data()!
        return {
          status: 'success',
          guestId: idemSnap.id,
          qrToken: existingData.qrToken as string,
          eventName: (event.name as string) || 'tu evento',
          email: '',
        }
      }
    }

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

    const maxCompanions = resolveMaxCompanions(event.maxCompanions as number | undefined)
    // Contra la definición REAL de campos del evento (mismo criterio que
    // customData arriba): cada acompañante debe traer nombre/apellido, más
    // los customFields obligatorios para el invitado principal — no una
    // lista de campos requeridos aparte. Rechaza en vez de recortar en
    // silencio un array que exceda el máximo: a diferencia del viejo
    // `partySize` (un número sin dueño), acá truncar perdería datos reales
    // que la persona ya tecleó.
    const companions = validatePublicCompanions(input.companions, maxCompanions, event.customFields as CustomFieldDef[] | undefined)
    const clampedPartySize = 1 + companions.length

    const currentGuestCount = typeof event.guestCount === 'number' ? event.guestCount : 0
    const currentPeopleCount = typeof event.peopleCount === 'number' ? event.peopleCount : currentGuestCount
    const capacitySnapshot = {
      attendeeLimitEnabled: event.attendeeLimitEnabled as boolean | undefined,
      peopleCount: currentPeopleCount,
      capacity: event.capacity as number | undefined,
    }

    // Idempotencia por cuenta: si esta cuenta ya tiene un guest de este
    // evento (ej. se autoregistró antes desde otro dispositivo, o dos
    // pestañas mandaron el mismo submit), no crear uno nuevo — la única
    // barrera real contra duplicados (el chequeo equivalente del lado del
    // cliente en EventJoin.tsx es solo UX, no seguridad). Pero si esta
    // vuelta trae MÁS acompañantes que el registro guardado (ej. la persona
    // completó el formulario de nuevo más tarde, o inició sesión recién a
    // mitad de un formulario que ya tenía acompañantes cargados), hay que
    // sumarlos en vez de devolver el registro viejo tal cual — antes de este
    // fix (bug reportado 2026-08-10) esos acompañantes se perdían en
    // silencio: la Callable respondía `status: 'success'` sin haber guardado
    // los datos recién tecleados. `email: ''` a propósito en ambos casos: la
    // Callable no debe reenviar el correo del pase para un registro que ya
    // existía.
    if (input.authUid) {
      const existingSnap = await tx.get(guestsCol.where('guestUid', '==', input.authUid).limit(1))
      if (!existingSnap.empty) {
        const existingRef = existingSnap.docs[0].ref
        const existingData = existingSnap.docs[0].data()
        const existingCompanions = (existingData.companions as unknown[] | undefined) || []
        const extraPeople = clampedPartySize - (1 + existingCompanions.length)

        if (extraPeople > 0) {
          if (!hasCapacityFor(capacitySnapshot, extraPeople, offeredCount)) return { status: 'full' }
          tx.update(existingRef, { companions, customData })
          applyCounterDeltas(db, tx, eventRef, eventId, {}, { peopleCount: currentPeopleCount + extraPeople })
          if (trimmedEmail || trimmedPhone) {
            tx.set(
              eventRef.collection('guestContacts').doc(existingRef.id),
              {
                email: trimmedEmail,
                phone: trimmedPhone,
                ...(trimmedPhone && input.phoneCountry ? { phoneCountry: input.phoneCountry } : {}),
                ...(trimmedPhone ? { whatsappConsent: true } : {}),
              },
              { merge: true },
            )
          }
        }

        return {
          status: 'success',
          guestId: existingRef.id,
          qrToken: existingData.qrToken as string,
          eventName: (event.name as string) || 'tu evento',
          email: '',
        }
      }
    }

    let guestPhotoURL: string | null = null
    if (input.authUid) {
      const userSnap = await tx.get(db.collection('users').doc(input.authUid))
      guestPhotoURL = (userSnap.data()?.photoURL as string | undefined) ?? null
    }

    const requiresPayment = (event.requiresPayment as boolean) || false
    const resolvedMethod = resolvePaymentMethod(requiresPayment, event.paymentMethods as PaymentMethod[] | undefined, input.paymentMethod)

    if (!hasCapacityFor(capacitySnapshot, clampedPartySize, offeredCount)) {
      return { status: 'full' }
    }

    const qrToken = generateQrToken()
    const guestRef = idempotencyKey ? guestsCol.doc(idempotencyKey) : guestsCol.doc()
    tx.set(guestRef, {
      name: trimmedName,
      lastName: trimmedLastName,
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      companions,
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
      // Autoregistro público — sujeto a EventData.maxCompanions también en
      // ediciones posteriores del organizador (ver GuestData.registrationSource).
      registrationSource: 'self',
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
