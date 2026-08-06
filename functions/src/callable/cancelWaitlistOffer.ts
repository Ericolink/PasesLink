// El organizador cancela una oferta activa (nadie respondió y no quiere
// esperar más, o se ofertó por error) — reemplaza el vencimiento automático
// de 24h del diseño original: sin presión de tiempo, el organizador decide
// cuándo una oferta dejó de tener sentido. Vuelve la entrada a 'waiting'
// (no 'declined' — no fue el invitado quien eligió, conserva su lugar en
// la fila) y dispara la cascada para ofertarle a la siguiente entrada —
// EXCLUYENDO a la que se acaba de cancelar en esta corrida puntual: como
// conserva su posición, sin esto podría ser la primera de la fila otra vez
// y la cascada se la volvería a ofertar de inmediato a sí misma, haciendo
// que "cancelar" no cambie nada en el caso común. Sigue disponible para
// una cascada futura (otro release, otra acción del organizador).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { cancelOffer } from '../waitlist/promote.js'
import { runCascade } from '../waitlist/cascade.js'
import { sendOfferEmail } from '../waitlist/notify.js'
import { canManageGuests } from '../lib/permissions.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface CancelWaitlistOfferInput {
  eventId: string
  entryId: string
}

// timeoutSeconds por encima del default liviano: runCascade + sendOfferEmail
// hacen una llamada HTTP real a Brevo por cada promoción, no solo una
// transacción de Firestore.
export const cancelWaitlistOffer = onCall<CancelWaitlistOfferInput>({ secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 30 }, (request) =>
  withCallableObservability(request, 'cancelWaitlistOffer', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, entryId } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !entryId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para cancelar la oferta.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para gestionar la lista de espera de este evento.')
    }

    const result = await cancelOffer(db, eventId, entryId)
    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        not_found: 'Esa entrada ya no existe.',
        not_offered: 'Esa oferta ya no está activa.',
      }
      throw new HttpsError('failed-precondition', messages[result.reason])
    }

    const outcome = await runCascade(db, eventId, new Set([entryId]))
    for (const promotion of outcome.promoted) {
      await sendOfferEmail(db, eventId, promotion.entryId, promotion.entry)
    }

    return { ok: true }
  }),
)
