// Checkout de concesiones (comida/bebida) — reemplaza la transacción de
// cliente que existía antes en src/firebase/concessions.ts. Sin
// `request.auth` obligatorio a propósito: el invitado puede no tener cuenta
// (mismo criterio que registerWalkInGuest) — la prueba real de identidad es
// el lockToken contra guests/{guestId}.lockTokens, verificada dentro del
// servicio. Toda la máquina de estados vive en
// functions/src/concessions/createConcessionOrder.ts.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import {
  createConcessionOrder as createConcessionOrderService,
  type ConcessionOrderLineInput,
} from '../concessions/createConcessionOrder.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface CreateConcessionOrderInput {
  eventId: string
  guestId: string
  guestNameSnapshot: string
  lockToken: string | null
  currency: string
  paymentMethod: 'transfer' | 'cash' | null
  lines: ConcessionOrderLineInput[]
}

export type CreateConcessionOrderResponse = { status: 'success'; orderId: string }

// maxInstances por encima del default global: pedidos de comida/bebida
// llegan en ráfaga durante el evento (todos los invitados pidiendo casi al
// mismo tiempo), sin autenticación obligatoria de por medio que limite el
// tráfico. timeoutSeconds bajo: una sola transacción (catálogo + stock +
// pedido), sin llamadas externas.
export const createConcessionOrder = onCall<CreateConcessionOrderInput>({ maxInstances: 15, timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'createConcessionOrder', async (ctx): Promise<CreateConcessionOrderResponse> => {
    const { eventId, guestId, guestNameSnapshot, lockToken, currency, paymentMethod, lines } = request.data || {}
    ctx.addContext({ uid: request.auth?.uid, eventId, guestId })
    if (!eventId || !guestId || !currency || !Array.isArray(lines) || lines.length === 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos para completar el pedido.')
    }

    const db = getFirestore()
    const result = await createConcessionOrderService(db, eventId, {
      guestId,
      guestNameSnapshot: guestNameSnapshot || '',
      lockToken: lockToken ?? null,
      currency,
      paymentMethod: paymentMethod ?? null,
      lines,
    })

    if (result.status === 'success') {
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.CONCESSION_ORDER_CREATED, { eventId, guestId, orderId: result.orderId, itemCount: lines.length })
      return { status: 'success', orderId: result.orderId }
    }
    if (result.status === 'event_not_found') throw new HttpsError('not-found', 'El evento no existe.')
    if (result.status === 'not_enabled') throw new HttpsError('failed-precondition', 'Este evento no tiene el menú activado.')
    if (result.status === 'forbidden') throw new HttpsError('permission-denied', 'No tienes permiso para hacer este pedido.')
    if (result.status === 'invalid_lines') throw new HttpsError('invalid-argument', 'El carrito tiene productos o cantidades inválidas.')
    // checkout_error: precio/stock/disponibilidad del catálogo — el `details`
    // lleva `itemId` para que el cliente resalte la línea puntual del carrito.
    throw new HttpsError('failed-precondition', result.message, { itemId: result.itemId })
  }),
)
