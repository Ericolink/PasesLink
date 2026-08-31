// Cancelación de una oferta activa de lista de espera — la entrada vuelve a
// 'waiting' conservando su posición en la fila (no fue elección del
// invitado). La creación de ofertas (antes: attemptPromote, disparada por la
// cascada automática) fue retirada junto con esa cascada — desactivada a
// pedido del organizador el 2026-08-16 (ver onCapacityFreed.ts en el
// historial de git). La promoción desde la waitlist es ahora 100% manual,
// vía "Pasar a la lista normal" (assignWaitlistSpot.ts / promoteToGuest.ts).
// confirmWaitlistOffer/declineWaitlistOffer/cancelWaitlistOffer siguen vivos
// para resolver entradas que ya estén en estado 'offered'.
import type { Firestore } from 'firebase-admin/firestore'

export type CancelOfferResult = { ok: true } | { ok: false; reason: 'not_found' | 'not_offered' }

// El organizador cancela una oferta activa (nadie respondió, o cambió de
// idea) — a diferencia de que el propio invitado decline (declineWaitlistOffer,
// terminal, status 'declined'), esto vuelve la entrada a 'waiting'
// conservando su priorityBoost/createdAt: no fue elección de esa persona,
// así que no pierde su lugar en la fila.
export async function cancelOffer(db: Firestore, eventId: string, entryId: string): Promise<CancelOfferResult> {
  const entryRef = db.collection('events').doc(eventId).collection('waitlist').doc(entryId)
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(entryRef)
    if (!snap.exists) return { ok: false, reason: 'not_found' }
    if (snap.data()!.status !== 'offered') return { ok: false, reason: 'not_offered' }
    tx.update(entryRef, {
      status: 'waiting',
      offerToken: null,
      offerExpiresAt: null,
      promotionReason: null,
    })
    return { ok: true }
  })
}
