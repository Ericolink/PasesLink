// Botón "Sí, ya pagó" del escáner (evento de pago, invitado sin pagar) —
// confirma el pago y hace el check-in en una sola transacción atómica del
// servidor. Toda la máquina de estados vive en
// functions/src/checkin/confirmPaymentAndCheckIn.ts.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { confirmPaymentAndCheckIn as confirmPaymentAndCheckInService } from '../checkin/confirmPaymentAndCheckIn.js'
import { canConfirmPayments, canScanQr } from '../lib/permissions.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface ConfirmPaymentAndCheckInInput {
  eventId: string
  guestId: string
  method?: PaymentMethod
  // Mismo significado que CheckInGuestInput.selection (ver callable/checkInGuest.ts).
  selection?: number[]
}

const VALID_METHODS: PaymentMethod[] = ['transfer', 'cash']

// minInstances: 1 — mismo motivo que checkInGuest.ts (camino crítico del
// escáner, momento de mayor tráfico del evento). region ya sale del
// default global (index.ts). timeoutSeconds bajo: mismo motivo que
// checkInGuest.ts (una sola transacción sin llamadas externas).
export const confirmPaymentAndCheckIn = onCall<ConfirmPaymentAndCheckInInput>(
  { minInstances: 1, maxInstances: 20, timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'confirmPaymentAndCheckIn', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestId, method, selection } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId, guestId })
    if (!eventId || !guestId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para confirmar el pago y registrar el ingreso.')
    }
    if (method !== undefined && !VALID_METHODS.includes(method)) {
      throw new HttpsError('invalid-argument', 'Método de pago inválido.')
    }
    if (selection !== undefined && (!Array.isArray(selection) || !selection.every((i) => typeof i === 'number'))) {
      throw new HttpsError('invalid-argument', 'Selección de personas inválida.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    const event = eventSnap.data()!
    // Mismo doble gate que ya exige la UI del escáner: la pantalla entera
    // requiere scanQr, el botón "Sí, ya pagó" requiere además confirmPayments.
    if (!canScanQr(event, request.auth.uid) || !canConfirmPayments(event, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para confirmar pagos y registrar ingresos en este evento.')
    }

    const result = await confirmPaymentAndCheckInService(db, eventId, guestId, {
      method,
      scannedBy: request.auth.uid,
      scannedByEmail: request.auth.token.email ?? null,
      source: { kind: 'manual', uid: request.auth.uid },
      selection,
    })
    if (!result.ok) {
      throw new HttpsError('not-found', result.reason === 'event_not_found' ? 'El evento no existe.' : 'El invitado no existe en este evento.')
    }
    logBusinessEvent(ctx.logger, BUSINESS_EVENTS.PAYMENT_CONFIRMED, { eventId, guestId, method })
    if (result.checkIn === 'success') logBusinessEvent(ctx.logger, BUSINESS_EVENTS.CHECKIN_SUCCESS, { eventId, guestId })
    return result
  }),
)
