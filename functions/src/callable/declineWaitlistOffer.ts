// El invitado dice "no, gracias" — libera el lugar de inmediato en vez de
// dejar la oferta abierta indefinidamente (mejor experiencia para el
// siguiente en la fila, que no tiene que esperar a que el organizador la
// cancele a mano).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { runCascade } from '../waitlist/cascade.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface DeclineWaitlistOfferInput {
  eventId: string
  entryId: string
  offerToken: string
}

export const declineWaitlistOffer = onCall<DeclineWaitlistOfferInput>((request) =>
  withCallableObservability(request, 'declineWaitlistOffer', async (ctx) => {
    const { eventId, entryId, offerToken } = request.data || {}
    ctx.addContext({ uid: request.auth?.uid, eventId })
    if (!eventId || !entryId || !offerToken) {
      throw new HttpsError('invalid-argument', 'Faltan datos para declinar la oferta.')
    }

    const db = getFirestore()
    const entryRef = db.collection('events').doc(eventId).collection('waitlist').doc(entryId)

    // Declinar una oferta que ya venció/se resolvió por otro camino (ej. el
    // barrido corrió un instante antes) es un no-op exitoso, no un error —
    // desde la perspectiva del invitado, tocar "no, gracias" un segundo tarde
    // no debería sentirse como una falla.
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(entryRef)
      if (!snap.exists) return
      const entry = snap.data()!
      if (entry.status !== 'offered' || entry.offerToken !== offerToken) return
      tx.update(entryRef, { status: 'declined', respondedAt: Date.now() })
    })

    await runCascade(db, eventId)

    return { ok: true }
  }),
)
