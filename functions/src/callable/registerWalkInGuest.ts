// Auto-registro público de invitados (Opción B, EventJoin.tsx) — reemplaza
// la transacción de cliente que existía antes en src/firebase/capacity.ts.
// Sin `request.auth` obligatorio a propósito: es el mismo criterio ya
// establecido por getOfferedWaitlistCount (tráfico público, sin datos
// sensibles que proteger con autenticación) — acá sí hay un chequeo de
// negocio real (cupo/entryMode), pero vive en el servicio, no en la
// autenticación de la Callable. Toda la máquina de estados vive en
// functions/src/capacity/registerWalkInGuest.ts.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { registerWalkInGuest as registerWalkInGuestService } from '../capacity/registerWalkInGuest.js'
import { GuestValidationError } from '../lib/guestValidation.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'

interface RegisterWalkInGuestInput {
  eventId: string
  name: string
  email?: string
  phone?: string
  phoneCountry?: string
  customData?: Record<string, string>
  partySize?: number
  paymentMethod?: PaymentMethod
}

export type RegisterWalkInGuestResponse =
  | { status: 'success'; qrToken: string }
  | { status: 'full' }
  | { status: 'error' }

export const registerWalkInGuest = onCall<RegisterWalkInGuestInput>(async (request): Promise<RegisterWalkInGuestResponse> => {
  const { eventId, name, email, phone, phoneCountry, customData, partySize, paymentMethod } = request.data || {}
  if (!eventId || !name) {
    throw new HttpsError('invalid-argument', 'Faltan datos para completar el registro.')
  }

  const db = getFirestore()
  try {
    const result = await registerWalkInGuestService(db, eventId, {
      name,
      email,
      phone,
      phoneCountry,
      customData,
      partySize,
      paymentMethod,
      // Nunca un uid/foto que mande el cliente en el body — solo el uid ya
      // verificado del token de la Callable, si hay sesión.
      authUid: request.auth?.uid ?? null,
    })

    if (result.status === 'success') return { status: 'success', qrToken: result.qrToken }
    if (result.status === 'full') return { status: 'full' }
    // event_not_found / not_open: mismo contrato que ya devuelve capacity.ts
    // hoy para "el evento ya no está disponible".
    return { status: 'error' }
  } catch (err) {
    if (err instanceof GuestValidationError) {
      throw new HttpsError('invalid-argument', err.message)
    }
    throw err
  }
})
