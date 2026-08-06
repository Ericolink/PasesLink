// Servicio puro que funde confirmación de pago + check-in en UNA sola
// transacción — restaura la atomicidad que existía antes de que el pago se
// migrara a Cloud Functions (ver comentario en Scanner.tsx:handleConfirmPayment,
// que hasta ahora hacía esto en dos llamadas de red no atómicas: primero
// setGuestPaymentStatus, después checkInGuest). Reusa computePaymentChange
// (misma máquina de estados que setGuestPaymentStatus/bulkSetGuestPaymentStatus,
// ver payments/confirmPayment.ts) y el mismo árbol de decisión de check-in
// que checkIn.ts, sin duplicar ninguna de las dos.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas, buildHourlyCheckinPatch } from '../lib/counters/index.js'
import type { CounterName } from '../lib/counters/index.js'
import { guestVersionFields } from '../lib/guestVersion.js'
import { computePaymentChange, partySizeFromRaw, type PaymentMethod, type PaymentSource } from '../payments/confirmPayment.js'
import { checkinHourLabel, guestPresence, mapGuestForResponse } from './shared.js'

export type ConfirmPaymentAndCheckInResult =
  | { ok: true; checkIn: 'success'; reentry: boolean; guest: Record<string, unknown> }
  | { ok: true; checkIn: 'already_checked_in'; guest: Record<string, unknown> }
  | { ok: true; checkIn: 'blocked_final_exit'; guest: Record<string, unknown> }
  | { ok: false; reason: 'event_not_found' | 'guest_not_found' }

export interface ConfirmPaymentAndCheckInOptions {
  method?: PaymentMethod
  scannedBy: string
  scannedByEmail: string | null
  source: PaymentSource
}

export async function confirmPaymentAndCheckIn(
  db: Firestore,
  eventId: string,
  guestId: string,
  opts: ConfirmPaymentAndCheckInOptions,
): Promise<ConfirmPaymentAndCheckInResult> {
  const eventRef = db.collection('events').doc(eventId)
  const guestRef = eventRef.collection('guests').doc(guestId)

  return db.runTransaction(async (tx) => {
    const [eventSnap, guestSnap] = await Promise.all([tx.get(eventRef), tx.get(guestRef)])
    if (!eventSnap.exists) return { ok: false, reason: 'event_not_found' }
    if (!guestSnap.exists) return { ok: false, reason: 'guest_not_found' }

    const guest = guestSnap.data()!
    const change = computePaymentChange(guest, 'paid', opts.method, opts.source)
    const guestAfterPayment = { ...guest, ...change.guestUpdates }

    const guestUpdates: Record<string, unknown> = { ...change.guestUpdates }
    const counterDeltas: Partial<Record<CounterName, number>> = { paidCount: change.paidCountDelta }

    // Presencia evaluada YA con el pago aplicado (en memoria, todavía sin
    // escribir) — el gate de pago de checkIn.ts nunca puede bloquear acá
    // porque el target es siempre 'paid'.
    const presence = guestPresence(guestAfterPayment)

    if (presence === 'inside') {
      if (Object.keys(guestUpdates).length > 0) tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas)
      return { ok: true, checkIn: 'already_checked_in', guest: mapGuestForResponse(guestId, guestAfterPayment) }
    }

    if (presence === 'final_out') {
      if (Object.keys(guestUpdates).length > 0) tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas)
      const blockedRef = eventRef.collection('checkins').doc()
      tx.set(blockedRef, {
        guestId,
        guestName: guest.name,
        type: 'entry_blocked',
        reason: 'final_exit_blocked',
        timestamp: FieldValue.serverTimestamp(),
        scannedBy: opts.scannedBy,
        scannedByEmail: opts.scannedByEmail,
      })
      return { ok: true, checkIn: 'blocked_final_exit', guest: mapGuestForResponse(guestId, guestAfterPayment) }
    }

    const isReentry = presence === 'temp_out'
    const partySize = partySizeFromRaw(guest.companions)
    const now = Date.now()

    Object.assign(guestUpdates, {
      status: 'checked_in',
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      ...(isReentry ? {} : { checkedInAt: FieldValue.serverTimestamp(), checkedInBy: opts.scannedBy, checkedInByEmail: opts.scannedByEmail }),
    })
    counterDeltas.occupancyCount = partySize
    if (!isReentry) counterDeltas.checkedInCount = partySize

    // Un solo update() por documento (evento + invitado) — la razón original
    // por la que este flujo se había partido en dos llamadas: Firestore no
    // permite dos transaction.update() separados sobre el mismo doc.
    tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
    applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas, buildHourlyCheckinPatch(checkinHourLabel()))

    const checkinRef = eventRef.collection('checkins').doc()
    tx.set(checkinRef, {
      guestId,
      guestName: guest.name,
      type: 'check_in',
      ...(isReentry ? { reentry: true } : {}),
      timestamp: FieldValue.serverTimestamp(),
      scannedBy: opts.scannedBy,
      scannedByEmail: opts.scannedByEmail,
    })

    return {
      ok: true,
      checkIn: 'success',
      reentry: isReentry,
      guest: mapGuestForResponse(guestId, {
        ...guestAfterPayment,
        ...guestUpdates,
        ...(isReentry ? {} : { checkedInAt: now }),
      }),
    }
  })
}
