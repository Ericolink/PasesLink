// Alta masiva de invitados a partir de una lista de nombres pegada (ver
// GuestAddForm.tsx, pestaña "Lista") — reemplaza el loop cliente de
// runTransaction por chunk que existía antes en src/firebase/guests.ts.
// Comparte createGuestsWithCapacity (functions/src/capacity/createGuests.ts)
// con addGuest/addGuestsFromRows: mismo cupo, mismo criterio de lista de
// espera, mismos contadores.
//
// "Llenar lo que entra + reportar" (CAPACITY_LIMIT_ARCHITECTURE.md §8): a
// diferencia de addGuest, cupo lleno a mitad de la lista NUNCA es un error —
// `skippedNames` en la respuesta ya lo comunica, así que nunca hace falta
// lanzar HttpsError por eso.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { createGuestsWithCapacity, type GuestWrite } from '../capacity/createGuests.js'
import { canManageGuests } from '../lib/permissions.js'
import { GUEST_FULL_NAME_MAX, GuestValidationError, requireMaxLength, requireNonEmpty } from '../lib/guestValidation.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface AddGuestsBulkInput {
  eventId: string
  names: string[]
}

export interface AddGuestsBulkResponse {
  added: number
  skippedNames: string[]
}

// Tope defensivo sobre el tamaño del payload de una sola llamada — muy por
// encima de cualquier lista pegada a mano, mismo criterio que
// MASS_MESSAGE_MAX_RECIPIENTS (src/utils/validation.ts).
const MAX_GUESTS_PER_CALL = 2000

// timeoutSeconds por encima del default: createGuestsWithCapacity trocea en
// lotes de 50 (CHUNK_SIZE), cada uno su propia transacción — con el tope de
// MAX_GUESTS_PER_CALL (2000) eso son hasta 40 transacciones secuenciales.
export const addGuestsBulk = onCall<AddGuestsBulkInput>({ timeoutSeconds: 120 }, (request) =>
  withCallableObservability(request, 'addGuestsBulk', async (ctx): Promise<AddGuestsBulkResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, names } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !Array.isArray(names) || names.length === 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos para agregar a los invitados.')
    }
    if (names.length > MAX_GUESTS_PER_CALL) {
      throw new HttpsError('invalid-argument', 'Demasiados invitados en una sola operación.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para agregar invitados a este evento.')
    }

    try {
      // Se valida la lista completa ANTES de escribir el primer lote: si un
      // solo nombre es inválido, no se crea ningún invitado — evita un alta
      // parcial por un error de tipeo en una línea cualquiera de la lista.
      const guestWrites: GuestWrite[] = names.map((name) => ({
        name: requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_FULL_NAME_MAX, 'El nombre'),
        companions: [],
      }))

      const result = await createGuestsWithCapacity(db, eventId, guestWrites, 'best-fit')
      const skippedNames = result.skipped.map((g) => g.name)
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_ADDED_BULK, { eventId, source: 'bulk_paste', added: result.createdIds.length, skipped: skippedNames.length })
      return { added: result.createdIds.length, skippedNames }
    } catch (err) {
      if (err instanceof GuestValidationError) throw new HttpsError('invalid-argument', err.message)
      throw err
    }
  }),
)
