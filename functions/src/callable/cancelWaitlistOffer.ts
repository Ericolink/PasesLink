// El organizador cancela una oferta activa (nadie respondió y no quiere
// esperar más, o se ofertó por error) — reemplaza el vencimiento automático
// de 24h del diseño original: sin presión de tiempo, el organizador decide
// cuándo una oferta dejó de tener sentido. Vuelve la entrada a 'waiting'
// (no 'declined' — no fue el invitado quien eligió, conserva su lugar en
// la fila).
//
// Ya NO dispara la cascada automática (runCascade) para ofertarle el lugar
// a la siguiente entrada — desactivado a pedido del organizador (evento
// debut, 2026-08-16): cancelar una oferta es, en la práctica, la forma de
// recuperar ese cupo para otra cosa (ej. agregarle acompañantes a un
// invitado ya confirmado); si el cupo se le volvía a ofertar de inmediato a
// la siguiente entrada, "cancelar" nunca liberaba nada de verdad. La
// promoción desde la waitlist es ahora 100% manual, vía "Pasar a la lista
// normal" (assignWaitlistSpot.ts).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { cancelOffer } from '../waitlist/promote.js'
import { hasPermission } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface CancelWaitlistOfferInput {
  eventId: string
  entryId: string
}

export const cancelWaitlistOffer = onCall<CancelWaitlistOfferInput>(
  { timeoutSeconds: 20 },
  (request) =>
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
    if (!hasPermission(eventSnap.data()!, request.auth.uid, 'addGuests', { isAdmin: request.auth.token.admin === true })) {
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

    return { ok: true }
  }),
)
