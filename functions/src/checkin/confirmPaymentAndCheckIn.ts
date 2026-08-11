// Servicio puro que funde confirmación de pago + check-in en UNA sola
// transacción — restaura la atomicidad que existía antes de que el pago se
// migrara a Cloud Functions (ver comentario en Scanner.tsx:handleConfirmPayment,
// que hasta ahora hacía esto en dos llamadas de red no atómicas: primero
// setGuestPaymentStatus, después checkInGuest). Reusa computePaymentChange
// (misma máquina de estados que setGuestPaymentStatus/bulkSetGuestPaymentStatus,
// ver payments/confirmPayment.ts) y planCheckIn (shared.ts, misma decisión de
// check-in parcial que usa checkIn.ts), sin duplicar ninguna de las dos.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas, buildHourlyCheckinPatch } from '../lib/counters/index.js'
import type { CounterName } from '../lib/counters/index.js'
import { guestVersionFields } from '../lib/guestVersion.js'
import { computePaymentChange, partySizeFromRaw, type PaymentMethod, type PaymentSource } from '../payments/confirmPayment.js'
import { checkinHourLabel, guestPresence, mapGuestForResponse, planCheckIn, presentIndicesOf } from './shared.js'

export type ConfirmPaymentAndCheckInResult =
  | { ok: true; checkIn: 'success'; reentry: boolean; partial: boolean; addedCount: number; guest: Record<string, unknown> }
  | { ok: true; checkIn: 'already_checked_in'; guest: Record<string, unknown> }
  | { ok: true; checkIn: 'needs_selection'; guest: Record<string, unknown>; pendingIndices: number[] }
  | { ok: true; checkIn: 'blocked_final_exit'; guest: Record<string, unknown> }
  | { ok: false; reason: 'event_not_found' | 'guest_not_found' }

export interface ConfirmPaymentAndCheckInOptions {
  method?: PaymentMethod
  scannedBy: string
  scannedByEmail: string | null
  source: PaymentSource
  selection?: number[]
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
    const total = partySizeFromRaw(guest.companions)

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

    if (presence === 'temp_out') {
      const existing = presentIndicesOf(guestAfterPayment, total)
      Object.assign(guestUpdates, { checkedOutAt: null, checkedOutByEmail: null, exitType: null })
      tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      counterDeltas.occupancyCount = existing.length
      applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas, buildHourlyCheckinPatch(checkinHourLabel()))

      const checkinRef = eventRef.collection('checkins').doc()
      tx.set(checkinRef, {
        guestId,
        guestName: guest.name,
        type: 'check_in',
        reentry: true,
        timestamp: FieldValue.serverTimestamp(),
        scannedBy: opts.scannedBy,
        scannedByEmail: opts.scannedByEmail,
      })

      return {
        ok: true,
        checkIn: 'success',
        reentry: true,
        partial: existing.length < total,
        addedCount: 0,
        guest: mapGuestForResponse(guestId, { ...guestAfterPayment, ...guestUpdates }),
      }
    }

    const plan = planCheckIn(guestAfterPayment, total, opts.selection)
    if (plan.kind === 'already_complete') {
      if (Object.keys(guestUpdates).length > 0) tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas)
      return { ok: true, checkIn: 'already_checked_in', guest: mapGuestForResponse(guestId, guestAfterPayment) }
    }
    if (plan.kind === 'needs_selection') {
      if (Object.keys(guestUpdates).length > 0) tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas)
      return { ok: true, checkIn: 'needs_selection', guest: mapGuestForResponse(guestId, guestAfterPayment), pendingIndices: plan.pending }
    }

    const isFirstArrival = presentIndicesOf(guestAfterPayment, total).length === 0
    const now = Date.now()
    Object.assign(guestUpdates, {
      status: 'checked_in',
      presentIndices: plan.merged,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      ...(isFirstArrival ? { checkedInAt: FieldValue.serverTimestamp(), checkedInBy: opts.scannedBy, checkedInByEmail: opts.scannedByEmail } : {}),
    })
    counterDeltas.occupancyCount = plan.newIndices.length
    counterDeltas.checkedInCount = plan.newIndices.length

    // Un solo update() por documento (evento + invitado) — la razón original
    // por la que este flujo se había partido en dos llamadas: Firestore no
    // permite dos transaction.update() separados sobre el mismo doc.
    tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
    applyCounterDeltas(db, tx, eventRef, eventId, counterDeltas, buildHourlyCheckinPatch(checkinHourLabel()))

    const partial = plan.merged.length < total
    const checkinRef = eventRef.collection('checkins').doc()
    tx.set(checkinRef, {
      guestId,
      guestName: guest.name,
      type: 'check_in',
      addedCount: plan.newIndices.length,
      partial,
      timestamp: FieldValue.serverTimestamp(),
      scannedBy: opts.scannedBy,
      scannedByEmail: opts.scannedByEmail,
    })

    return {
      ok: true,
      checkIn: 'success',
      reentry: false,
      partial,
      addedCount: plan.newIndices.length,
      guest: mapGuestForResponse(guestId, {
        ...guestAfterPayment,
        ...guestUpdates,
        ...(isFirstArrival ? { checkedInAt: now } : {}),
      }),
    }
  })
}
