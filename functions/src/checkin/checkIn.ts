// Servicio puro de check-in — Admin SDK, sin HttpsError ni chequeo de
// permisos (eso vive en la Callable que lo invoca, ver
// callable/checkInGuest.ts). Puerto directo de checkInGuest() en
// src/firebase/guests.ts, misma máquina de estados (guestPresence),
// reusable a futuro por validaciones automáticas / otras integraciones sin
// duplicar nada de esto (objetivo del ticket de migración).
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas, buildHourlyCheckinPatch } from '../lib/counters/index.js'
import { guestVersionFields } from '../lib/guestVersion.js'
import { partySizeFromRaw } from '../payments/confirmPayment.js'
import { checkinHourLabel, guestPresence, mapGuestForResponse } from './shared.js'

export type CheckInResult =
  | { status: 'success'; guest: Record<string, unknown>; reentry: boolean }
  | { status: 'already_checked_in'; guest: Record<string, unknown> }
  | { status: 'payment_required'; guest: Record<string, unknown> }
  | { status: 'blocked_final_exit'; guest: Record<string, unknown> }
  | { status: 'not_found' }

export async function checkInGuest(
  db: Firestore,
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
): Promise<CheckInResult> {
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

    if (presence === 'inside') {
      return { status: 'already_checked_in', guest: mapGuestForResponse(guestRef.id, guest) }
    }

    if (presence === 'final_out') {
      const blockedRef = eventRef.collection('checkins').doc()
      tx.set(blockedRef, {
        guestId: guestRef.id,
        guestName: guest.name,
        type: 'entry_blocked',
        reason: 'final_exit_blocked',
        timestamp: FieldValue.serverTimestamp(),
        scannedBy,
        scannedByEmail,
      })
      return { status: 'blocked_final_exit', guest: mapGuestForResponse(guestRef.id, guest) }
    }

    const isReentry = presence === 'temp_out'

    // El gate de pago solo aplica a la primera entrada — un reingreso ya lo
    // pasó antes (ver mismo comentario en el checkInGuest original).
    if (!isReentry) {
      const eventSnap = await tx.get(eventRef)
      if (eventSnap.data()?.requiresPayment && guest.paymentStatus !== 'paid') {
        return { status: 'payment_required', guest: mapGuestForResponse(guestRef.id, guest) }
      }
    }

    const partySize = partySizeFromRaw(guest.companions)
    const now = Date.now()
    const guestUpdates: Record<string, unknown> = {
      status: 'checked_in',
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      ...(isReentry ? {} : { checkedInAt: FieldValue.serverTimestamp(), checkedInBy: scannedBy, checkedInByEmail: scannedByEmail }),
    }
    tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })

    applyCounterDeltas(
      db,
      tx,
      eventRef,
      eventId,
      { occupancyCount: partySize, checkedInCount: isReentry ? 0 : partySize },
      buildHourlyCheckinPatch(checkinHourLabel()),
    )

    const checkinRef = eventRef.collection('checkins').doc()
    tx.set(checkinRef, {
      guestId: guestRef.id,
      guestName: guest.name,
      type: 'check_in',
      ...(isReentry ? { reentry: true } : {}),
      timestamp: FieldValue.serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      guest: mapGuestForResponse(guestRef.id, {
        ...guest,
        ...guestUpdates,
        ...(isReentry ? {} : { checkedInAt: now }),
      }),
      reentry: isReentry,
    }
  })
}
