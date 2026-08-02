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

export const createConcessionOrder = onCall<CreateConcessionOrderInput>(async (request): Promise<CreateConcessionOrderResponse> => {
  const { eventId, guestId, guestNameSnapshot, lockToken, currency, paymentMethod, lines } = request.data || {}
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

  if (result.status === 'success') return { status: 'success', orderId: result.orderId }
  if (result.status === 'event_not_found') throw new HttpsError('not-found', 'El evento no existe.')
  if (result.status === 'not_enabled') throw new HttpsError('failed-precondition', 'Este evento no tiene el menú activado.')
  if (result.status === 'forbidden') throw new HttpsError('permission-denied', 'No tienes permiso para hacer este pedido.')
  if (result.status === 'invalid_lines') throw new HttpsError('invalid-argument', 'El carrito tiene productos o cantidades inválidas.')
  // checkout_error: precio/stock/disponibilidad del catálogo — el `details`
  // lleva `itemId` para que el cliente resalte la línea puntual del carrito.
  throw new HttpsError('failed-precondition', result.message, { itemId: result.itemId })
})
