// El invitado dice "no, gracias" — libera el lugar de inmediato (el status
// pasa a 'declined', sale del cupo reservado) en vez de dejar la oferta
// abierta indefinidamente.
//
// Ya NO dispara la cascada automática (runCascade) para ofertarle el lugar
// al siguiente en la fila — desactivado a pedido del organizador (evento
// debut, 2026-08-16): la cascada competía por capacidad recién liberada
// contra ediciones manuales del propio organizador (ver el mismo motivo en
// onCapacityFreed.ts y cancelWaitlistOffer.ts). La promoción desde la
// waitlist es ahora 100% manual, vía "Pasar a la lista normal"
// (assignWaitlistSpot.ts) — el organizador ve el lugar liberado en el panel
// y decide a quién dárselo.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface DeclineWaitlistOfferInput {
  eventId: string
  entryId: string
  offerToken: string
}

// timeoutSeconds bajo: una transacción + runCascade (acotada por
// CANDIDATE_BATCH_SIZE), sin llamadas externas.
export const declineWaitlistOffer = onCall<DeclineWaitlistOfferInput>({ timeoutSeconds: 20 }, (request) =>
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

    return { ok: true }
  }),
)
