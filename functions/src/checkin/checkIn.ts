// Servicio puro de check-in — Admin SDK, sin HttpsError ni chequeo de
// permisos (eso vive en la Callable que lo invoca, ver
// callable/checkInGuest.ts). Puerto directo de checkInGuest() en
// src/firebase/guests.ts, misma máquina de estados (guestPresence),
// reusable a futuro por validaciones automáticas / otras integraciones sin
// duplicar nada de esto (objetivo del ticket de migración).
//
// Check-in parcial (familias/acompañantes): `presentIndices` (ver shared.ts)
// registra QUIÉNES de la invitación ya entraron (0 = invitado principal,
// 1..N = companions[i-1]), no solo SI entró. `selection` (parámetro de esta
// función) es la elección del encargado en la puerta — ausente en el primer
// sondeo de una invitación con varias personas (devuelve 'needs_selection'
// sin escribir nada) o cuando confirma quiénes de los pendientes están
// ingresando ahora. planCheckIn (shared.ts) es la única fuente de verdad de
// esa decisión, compartida con confirmPaymentAndCheckIn.ts.
import { FieldValue, type Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas, buildHourlyCheckinPatch } from '../lib/counters/index.js'
import { guestVersionFields } from '../lib/guestVersion.js'
import { partySizeFromRaw } from '../payments/confirmPayment.js'
import { checkinHourLabel, guestPresence, mapGuestForResponse, planCheckIn, presentIndicesOf } from './shared.js'

export type CheckInResult =
  | { status: 'success'; guest: Record<string, unknown>; reentry: boolean; partial: boolean; addedCount: number }
  | { status: 'already_checked_in'; guest: Record<string, unknown> }
  | { status: 'needs_selection'; guest: Record<string, unknown>; pendingIndices: number[] }
  | { status: 'payment_required'; guest: Record<string, unknown> }
  | { status: 'blocked_final_exit'; guest: Record<string, unknown> }
  | { status: 'not_found' }

export async function checkInGuest(
  db: Firestore,
  eventId: string,
  qrToken: string,
  scannedBy: string,
  scannedByEmail: string | null,
  selection?: number[],
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
    const total = partySizeFromRaw(guest.companions)

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

    // Reingreso tras una salida temporal: vuelve a entrar exactamente quien
    // ya estaba adentro antes de salir (mismo criterio que antes de partial
    // check-in) — no vuelve a pedir selección ni consulta a los pendientes
    // que nunca llegaron a entrar (ver comentario de planCheckIn en
    // shared.ts sobre el alcance de esta migración: exit/reentry sigue
    // siendo a nivel de toda la invitación).
    if (presence === 'temp_out') {
      const existing = presentIndicesOf(guest, total)
      const guestUpdates = { checkedOutAt: null, checkedOutByEmail: null, exitType: null }
      tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })
      applyCounterDeltas(db, tx, eventRef, eventId, { occupancyCount: existing.length }, buildHourlyCheckinPatch(checkinHourLabel()))

      const checkinRef = eventRef.collection('checkins').doc()
      tx.set(checkinRef, {
        guestId: guestRef.id,
        guestName: guest.name,
        type: 'check_in',
        reentry: true,
        timestamp: FieldValue.serverTimestamp(),
        scannedBy,
        scannedByEmail,
      })

      return {
        status: 'success',
        reentry: true,
        partial: existing.length < total,
        addedCount: 0,
        guest: mapGuestForResponse(guestRef.id, { ...guest, ...guestUpdates }),
      }
    }

    // El gate de pago solo aplica a la primera persona de esta invitación
    // que entra alguna vez — si ya hay alguien adentro (parcial), el resto
    // de la familia ya pasó ese control.
    if (presentIndicesOf(guest, total).length === 0) {
      const eventSnap = await tx.get(eventRef)
      if (eventSnap.data()?.requiresPayment && guest.paymentStatus !== 'paid') {
        return { status: 'payment_required', guest: mapGuestForResponse(guestRef.id, guest) }
      }
    }

    const plan = planCheckIn(guest, total, selection)
    if (plan.kind === 'already_complete') {
      return { status: 'already_checked_in', guest: mapGuestForResponse(guestRef.id, guest) }
    }
    if (plan.kind === 'needs_selection') {
      return { status: 'needs_selection', guest: mapGuestForResponse(guestRef.id, guest), pendingIndices: plan.pending }
    }

    const isFirstArrival = presentIndicesOf(guest, total).length === 0
    const now = Date.now()
    const guestUpdates: Record<string, unknown> = {
      status: 'checked_in',
      presentIndices: plan.merged,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      ...(isFirstArrival ? { checkedInAt: FieldValue.serverTimestamp(), checkedInBy: scannedBy, checkedInByEmail: scannedByEmail } : {}),
    }
    tx.update(guestRef, { ...guestUpdates, ...guestVersionFields() })

    applyCounterDeltas(
      db,
      tx,
      eventRef,
      eventId,
      { occupancyCount: plan.newIndices.length, checkedInCount: plan.newIndices.length },
      buildHourlyCheckinPatch(checkinHourLabel()),
    )

    const partial = plan.merged.length < total
    const checkinRef = eventRef.collection('checkins').doc()
    tx.set(checkinRef, {
      guestId: guestRef.id,
      guestName: guest.name,
      type: 'check_in',
      addedCount: plan.newIndices.length,
      partial,
      timestamp: FieldValue.serverTimestamp(),
      scannedBy,
      scannedByEmail,
    })

    return {
      status: 'success',
      reentry: false,
      partial,
      addedCount: plan.newIndices.length,
      guest: mapGuestForResponse(guestRef.id, {
        ...guest,
        ...guestUpdates,
        ...(isFirstArrival ? { checkedInAt: now } : {}),
      }),
    }
  })
}
