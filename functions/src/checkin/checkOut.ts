// Servicio puro de check-out — mismo criterio que checkIn.ts. Puerto directo
// de checkOutGuest() en src/firebase/guests.ts.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas } from '../lib/counters/index.js'
import { guestVersionFields } from '../lib/guestVersion.js'
import { partySizeFromRaw } from '../payments/confirmPayment.js'
import { guestPresence, mapGuestForResponse } from './shared.js'

export type CheckOutResult =
  | { status: 'success'; guest: Record<string, unknown>; kind: 'temporary' | 'final' }
  | { status: 'not_checked_in' }
  | { status: 'already_checked_out'; guest: Record<string, unknown> }
  | { status: 'not_found' }

export async function checkOutGuest(
  db: Firestore,
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
  kind: 'temporary' | 'final',
): Promise<CheckOutResult> {
  const guestsCol = db.collection('events').doc(eventId).collection('guests')
  const eventRef = db.collection('events').doc(eventId)

  const lookup = await guestsCol.where('qrToken', '==', qrToken).limit(1).get()
  if (lookup.empty) return { status: 'not_found' }
  const guestRef = lookup.docs[0].ref

  return db.runTransaction(async (tx) => {
    const guestSnap = await tx.get(guestRef)
    if (!guestSnap.exists) return { status: 'not_found' }
    const guest = guestSnap.data()!
    const presence = guestPresence(guest)

    if (presence === 'invited') return { status: 'not_checked_in' }
    if (presence === 'temp_out' || presence === 'final_out') {
      return { status: 'already_checked_out', guest: mapGuestForResponse(guestRef.id, guest) }
    }

    const partySize = partySizeFromRaw(guest.companions)
    const now = Date.now()
    const guestUpdates = {
      checkedOutAt: FieldValue.serverTimestamp(),
      checkedOutByEmail: scannedByEmail,
      exitType: kind,
    }
    tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
    applyCounterDeltas(db, tx, eventRef, eventId, { occupancyCount: -partySize })

    const checkinRef = eventRef.collection('checkins').doc()
    tx.set(checkinRef, {
      guestId: guestRef.id,
      guestName: guest.name,
      type: 'check_out',
      exitKind: kind,
      timestamp: FieldValue.serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: mapGuestForResponse(guestRef.id, { ...guest, ...guestUpdates, checkedOutAt: now }),
      kind,
    }
  })
}
