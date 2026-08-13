// Versión masiva de setGuestPaymentStatus.ts — un solo chequeo de permisos
// (no por invitado) y un delta de paidCount agregado por lote, vía
// bulkConfirmGuestPayments (functions/src/payments/confirmPayment.ts).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { bulkConfirmGuestPayments, type PaymentMethod } from '../payments/confirmPayment.js'
import { hasPermission } from '../lib/permissions.js'
import { enqueueNotification } from '../lib/notifications.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface BulkSetGuestPaymentStatusInput {
  eventId: string
  guestIds: string[]
  paymentStatus: 'paid' | 'unpaid'
  defaultMethod?: PaymentMethod
}

const VALID_METHODS: PaymentMethod[] = ['transfer', 'cash']
// Tope defensivo — muy por encima de cualquier selección real en GuestList,
// evita que una llamada mal formada dispare cientos de lotes de golpe.
const MAX_GUEST_IDS = 1000

// timeoutSeconds por encima del default: bulkConfirmGuestPayments trocea en
// lotes de 50 (MAX_GUESTS_PER_CHUNK) — con el tope de MAX_GUEST_IDS (1000)
// eso son hasta 20 transacciones secuenciales.
export const bulkSetGuestPaymentStatus = onCall<BulkSetGuestPaymentStatusInput>({ timeoutSeconds: 90 }, (request) =>
  withCallableObservability(request, 'bulkSetGuestPaymentStatus', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestIds, paymentStatus, defaultMethod } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !Array.isArray(guestIds) || guestIds.length === 0 || (paymentStatus !== 'paid' && paymentStatus !== 'unpaid')) {
      throw new HttpsError('invalid-argument', 'Faltan datos para actualizar los pagos.')
    }
    if (guestIds.length > MAX_GUEST_IDS) {
      throw new HttpsError('invalid-argument', 'Demasiados invitados en una sola operación.')
    }
    // `!= null` (no `!== undefined`): ver el mismo comentario en
    // setGuestPaymentStatus.ts — el cliente serializa `undefined` como
    // `null`, y `defaultMethod` no siempre se manda (ej. marcar como "no
    // pagado" en lote).
    if (defaultMethod != null && !VALID_METHODS.includes(defaultMethod)) {
      throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!hasPermission(eventSnap.data()!, request.auth.uid, 'confirmPayments', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para confirmar pagos en este evento.')
    }

    const result = await bulkConfirmGuestPayments(db, eventId, guestIds, paymentStatus, {
      defaultMethod,
      source: { kind: 'manual', uid: request.auth.uid },
    })

    await Promise.all(result.notifications.map((notify) => enqueueNotification(db, {
      eventId,
      type: 'payment_confirmed',
      recipientUid: notify.ownerId,
      payload: { title: 'Pago confirmado', body: `${notify.guestName} pagó su entrada a ${notify.eventName}.`, deepLink: `/events/${eventId}` },
    }).catch((err) => ctx.logger.warn('No se pudo encolar la notificación de pago confirmado', { error: err }))))

    logBusinessEvent(ctx.logger, paymentStatus === 'paid' ? BUSINESS_EVENTS.PAYMENT_CONFIRMED : BUSINESS_EVENTS.PAYMENT_REGISTERED, { eventId, guestCount: guestIds.length, failedCount: result.failed })
    return { ok: result.ok, failed: result.failed }
  }),
)
