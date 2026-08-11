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
import { sendGuestPassEmail } from '../capacity/guestPassEmail.js'
import { GuestValidationError } from '../lib/guestValidation.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface RegisterWalkInGuestInput {
  eventId: string
  name: string
  lastName?: string
  email?: string
  phone?: string
  phoneCountry?: string
  customData?: Record<string, string>
  companions?: unknown
  paymentMethod?: PaymentMethod
}

export type RegisterWalkInGuestResponse =
  | { status: 'success'; qrToken: string }
  | { status: 'full' }
  | { status: 'error' }

// maxInstances por encima del default global: auto-registro público sin
// autenticación obligatoria, con tráfico concentrado en la puerta al
// arrancar el evento (mismo patrón de ráfaga que checkInGuest, aunque sin
// minInstances — no es tan sensible a 1-2s de cold start como el escáner,
// que además tiene un ingreso continuo durante todo el evento).
// timeoutSeconds moderado: la transacción es rápida, pero el envío del
// pase por email (best-effort, después de comprometida la transacción) es
// una llamada HTTP real a Brevo.
export const registerWalkInGuest = onCall<RegisterWalkInGuestInput>(
  { secrets: [brevoApiKey, brevoSenderEmail], maxInstances: 15, timeoutSeconds: 30 },
  (request) => withCallableObservability(request, 'registerWalkInGuest', async (ctx): Promise<RegisterWalkInGuestResponse> => {
    const { eventId, name, lastName, email, phone, phoneCountry, customData, companions, paymentMethod } = request.data || {}
    ctx.addContext({ uid: request.auth?.uid, eventId })
    if (!eventId || !name) {
      throw new HttpsError('invalid-argument', 'Faltan datos para completar el registro.')
    }

    const db = getFirestore()
    try {
      const result = await registerWalkInGuestService(db, eventId, {
        name,
        lastName,
        email,
        phone,
        phoneCountry,
        customData,
        companions,
        paymentMethod,
        // Nunca un uid/foto que mande el cliente en el body — solo el uid ya
        // verificado del token de la Callable, si hay sesión.
        authUid: request.auth?.uid ?? null,
      })

      if (result.status === 'success') {
        // Best-effort, después de comprometida la transacción (ver
        // guestPassEmail.ts): el pase ya funciona solo con el qrToken que
        // se devuelve al cliente, un fallo acá nunca debe convertir un
        // registro exitoso en un error de cara al invitado.
        if (result.email) {
          try {
            await sendGuestPassEmail(db, {
              eventId,
              guestId: result.guestId,
              toEmail: result.email,
              eventName: result.eventName,
              qrToken: result.qrToken,
            })
          } catch (err) {
            ctx.logger.warn('No se pudo enviar el correo del pase tras el registro walk-in', { error: err, eventId, guestId: result.guestId })
          }
        }
        const partySize = 1 + (Array.isArray(companions) ? companions.length : 0)
        logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_ADDED_WALKIN, { eventId, guestId: result.guestId, partySize })
        return { status: 'success', qrToken: result.qrToken }
      }
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
  }),
)
