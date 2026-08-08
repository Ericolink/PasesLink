// El invitado confirma su propia oferta ("¡Se liberó un lugar para ti!").
// La mutación de mayor riesgo de esta familia — crea un `guests` doc real y
// puede destrabar un flujo de pago. Por eso vive acá (Callable Function,
// Admin SDK) y no como una escritura de cliente — es la pieza central de
// "menor cantidad de lógica crítica en React" (ver §3 de
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md). El cliente solo llama esta
// función y muestra el resultado. Núcleo transaccional compartido con
// assignWaitlistSpot.ts (asignación directa del organizador) — ver
// promoteEntryToGuest.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { promoteEntryToGuest } from '../waitlist/promoteToGuest.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface ConfirmWaitlistOfferInput {
  eventId: string
  entryId: string
  offerToken: string
  paymentMethod?: 'transfer' | 'cash'
}

interface ConfirmWaitlistOfferResult {
  qrToken: string
}

// timeoutSeconds bajo: una sola transacción, sin llamadas externas.
export const confirmWaitlistOffer = onCall<ConfirmWaitlistOfferInput>({ timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'confirmWaitlistOffer', async (ctx): Promise<ConfirmWaitlistOfferResult> => {
    const { eventId, entryId, offerToken, paymentMethod } = request.data || {}
    ctx.addContext({ uid: request.auth?.uid, eventId })
    if (!eventId || !entryId || !offerToken) {
      throw new HttpsError('invalid-argument', 'Faltan datos para confirmar la oferta.')
    }

    const db = getFirestore()
    const result = await promoteEntryToGuest(db, eventId, entryId, {
      guestUid: request.auth?.uid ?? null,
      paymentMethod,
      offerToken,
    })

    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        not_found: 'No se encontró la entrada de la lista de espera.',
        // offerToken de un solo uso, corta vida — separado de waitlistToken a
        // propósito (ver §5 del RFC): que alguien tenga el link de estado de
        // la fila no alcanza para reclamar un lugar real. La oferta no
        // vence sola (ver promote.ts) — solo puede dejar de estar
        // disponible porque el invitado ya la resolvió, o el organizador la
        // canceló/asignó directo (cancelWaitlistOffer.ts / assignWaitlistSpot.ts).
        not_available: 'Esta oferta ya no está disponible.',
        // Chequeo final y autoritativo — attemptPromote (promote.ts) ya
        // validó capacidad al OFERTAR, pero esta es la única garantía real
        // de no exceder el cupo al CREAR el guest doc. Puede fallar en el
        // caso raro de que un alta manual del organizador haya consumido
        // el lugar mientras la oferta estaba activa (§7 del RFC).
        no_capacity: 'El evento ya no tiene lugar disponible.',
      }
      const codes: Record<typeof result.reason, 'not-found' | 'failed-precondition' | 'resource-exhausted'> = {
        not_found: 'not-found',
        not_available: 'failed-precondition',
        no_capacity: 'resource-exhausted',
      }
      throw new HttpsError(codes[result.reason], messages[result.reason])
    }

    logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_PROMOTED_FROM_WAITLIST, { eventId, entryId, reason: 'guest_confirmed' })
    return { qrToken: result.qrToken }
  }),
)
