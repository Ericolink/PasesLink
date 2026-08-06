// Confirmación manual de pago del organizador (transferencia/SPEI/depósito/
// efectivo) — reemplaza la transacción de cliente que existía antes en
// src/firebase/guests.ts. Toda la máquina de estados vive en
// functions/src/payments/confirmPayment.ts, reutilizable por una futura
// pasarela (webhook) sin tocar esta Callable.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { confirmGuestPayment, type PaymentMethod } from '../payments/confirmPayment.js'
import { canConfirmPayments } from '../lib/permissions.js'
import { enqueueNotification } from '../lib/notifications.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface SetGuestPaymentStatusInput {
  eventId: string
  guestId: string
  paymentStatus: 'paid' | 'unpaid'
  method?: PaymentMethod
}

const VALID_METHODS: PaymentMethod[] = ['transfer', 'cash']

// timeoutSeconds bajo: una transacción + un enqueueNotification (escritura
// de Firestore, no una llamada externa) — sin margen para el timeout de
// 60s por defecto.
export const setGuestPaymentStatus = onCall<SetGuestPaymentStatusInput>({ timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'setGuestPaymentStatus', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestId, paymentStatus, method } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId, guestId })
    if (!eventId || !guestId || (paymentStatus !== 'paid' && paymentStatus !== 'unpaid')) {
      throw new HttpsError('invalid-argument', 'Faltan datos para actualizar el pago.')
    }
    if (method !== undefined && !VALID_METHODS.includes(method)) {
      throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canConfirmPayments(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para confirmar pagos en este evento.')
    }

    const result = await confirmGuestPayment(db, eventId, guestId, paymentStatus, {
      method,
      source: { kind: 'manual', uid: request.auth.uid },
    })
    if (!result.ok) {
      throw new HttpsError('not-found', result.reason === 'event_not_found' ? 'El evento no existe.' : 'El invitado no existe en este evento.')
    }

    if (result.notify) {
      await enqueueNotification(db, {
        eventId,
        type: 'payment_confirmed',
        recipientUid: result.notify.ownerId,
        payload: { title: 'Pago confirmado', body: `${result.notify.guestName} pagó su entrada a ${result.notify.eventName}.`, deepLink: `/events/${eventId}` },
      }).catch((err) => ctx.logger.warn('No se pudo encolar la notificación de pago confirmado', { error: err }))
    }

    logBusinessEvent(ctx.logger, paymentStatus === 'paid' ? BUSINESS_EVENTS.PAYMENT_CONFIRMED : BUSINESS_EVENTS.PAYMENT_REGISTERED, { eventId, guestId, method })
    return { ok: true }
  }),
)
