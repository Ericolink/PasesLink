// Máquina de estados de pago — único lugar que decide si un invitado pasa a
// 'paid'/'unpaid' y ajusta events/{eventId}.paidCount. Mismo rol que
// waitlist/promote.ts (servicio puro, sin HttpsError ni chequeo de permisos
// acá — eso vive en la Callable que lo invoca, ver callable/setGuestPaymentStatus.ts)
// para que un futuro webhook de pasarela (Stripe/Mercado Pago/PayPal) pueda
// llamar exactamente esta misma función con `source: { kind: 'webhook', ... }`
// sin reimplementar nada de esto.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { applyCounterDeltas } from '../lib/counters/index.js'

export type PaymentMethod = 'transfer' | 'cash'

export type PaymentSource =
  | { kind: 'manual'; uid: string }
  | { kind: 'webhook'; gateway: string }

function paidByFromSource(source: PaymentSource): string {
  return source.kind === 'manual' ? source.uid : source.gateway
}

// Mismo cálculo que partySize() en src/firebase/guests.ts, pero sobre el
// dato crudo de Firestore (sin pasar por mapGuest/normalizeCompanions) —
// `companions` puede ser un array (formato actual) o un número legacy
// (formato con el que confirmWaitlistOffer.ts todavía crea invitados).
// Exportada para que functions/src/checkin/ (confirmPaymentAndCheckIn) la
// reuse sin duplicar el cálculo.
export function partySizeFromRaw(companions: unknown): number {
  if (Array.isArray(companions)) return companions.length + 1
  if (typeof companions === 'number' && companions > 0) return companions + 1
  return 1
}

// Calcula los campos a escribir en el invitado + el delta de paidCount para
// UNA transición de pago — compartido por confirmGuestPayment (invitado
// suelto), bulkConfirmGuestPayments (cada invitado del lote) y
// functions/src/checkin/confirmPaymentAndCheckIn.ts (pago + check-in
// atómicos), para que las tres rutas apliquen exactamente la misma máquina
// de estados.
export function computePaymentChange(
  guest: DocumentData,
  target: 'paid' | 'unpaid',
  method: PaymentMethod | undefined,
  source: PaymentSource,
): { changed: boolean; guestUpdates: Record<string, unknown>; paidCountDelta: number } {
  const wasPaid = guest.paymentStatus === 'paid'
  const willBePaid = target === 'paid'
  const currentMethod = (guest.paymentMethod as PaymentMethod | null) ?? null
  const nextMethod = method !== undefined ? method : currentMethod

  // Idempotencia + "evitar escrituras innecesarias": mismo estado y mismo
  // método que ya tenía el invitado -> no-op total.
  if (wasPaid === willBePaid && currentMethod === nextMethod) {
    return { changed: false, guestUpdates: {}, paidCountDelta: 0 }
  }

  const partySize = partySizeFromRaw(guest.companions)
  const guestUpdates: Record<string, unknown> = { paymentStatus: willBePaid ? 'paid' : 'unpaid' }
  if (method !== undefined) guestUpdates.paymentMethod = nextMethod

  let paidCountDelta = 0
  if (!wasPaid && willBePaid) {
    // Transición real a pagado: única vez que se escriben paidAt/paidBy y se
    // suma paidCount.
    guestUpdates.paidAt = Date.now()
    guestUpdates.paidBy = paidByFromSource(source)
    paidCountDelta = partySize
  } else if (wasPaid && !willBePaid) {
    // Reversión: se limpia el rastro de auditoría, no tiene sentido
    // conservar "cuándo/quién confirmó" un pago que ya no está vigente.
    guestUpdates.paidAt = null
    guestUpdates.paidBy = null
    paidCountDelta = -partySize
  }
  // paid -> paid (solo cambia método) y unpaid -> unpaid (idem): no tocan
  // paidCount/paidAt/paidBy, solo lo que realmente cambió arriba.

  return { changed: true, guestUpdates, paidCountDelta }
}

export type ConfirmPaymentNotify = { ownerId: string; eventName: string; guestName: string }

export type ConfirmPaymentResult =
  | { ok: true; changed: boolean; notify: ConfirmPaymentNotify | null }
  | { ok: false; reason: 'event_not_found' | 'guest_not_found' }

export interface ConfirmPaymentOptions {
  method?: PaymentMethod
  source: PaymentSource
}

// Transacción única: evento + invitado viven bajo el mismo path
// (events/{eventId}/guests/{guestId}), así que un guestId de OTRO evento ya
// da 'guest_not_found' por construcción del path — no hace falta un chequeo
// de pertenencia aparte.
export async function confirmGuestPayment(
  db: Firestore,
  eventId: string,
  guestId: string,
  target: 'paid' | 'unpaid',
  opts: ConfirmPaymentOptions,
): Promise<ConfirmPaymentResult> {
  const eventRef = db.collection('events').doc(eventId)
  const guestRef = eventRef.collection('guests').doc(guestId)

  return db.runTransaction(async (tx) => {
    const [eventSnap, guestSnap] = await Promise.all([tx.get(eventRef), tx.get(guestRef)])
    if (!eventSnap.exists) return { ok: false, reason: 'event_not_found' }
    if (!guestSnap.exists) return { ok: false, reason: 'guest_not_found' }

    const event = eventSnap.data()!
    const guest = guestSnap.data()!
    const change = computePaymentChange(guest, target, opts.method, opts.source)
    if (!change.changed) return { ok: true, changed: false, notify: null }

    tx.update(guestRef, change.guestUpdates)
    applyCounterDeltas(db, tx, eventRef, eventId, { paidCount: change.paidCountDelta })

    const notify = change.paidCountDelta > 0 && event.ownerId
      ? { ownerId: event.ownerId as string, eventName: (event.name as string) || '', guestName: (guest.name as string) || '' }
      : null
    return { ok: true, changed: true, notify }
  })
}

const MAX_GUESTS_PER_CHUNK = 50

export interface BulkConfirmOptions {
  // Método a usar cuando el invitado todavía no tiene uno propio — mismo rol
  // que `resolveMethod` en el bulkSetGuestPaymentStatus de cliente que este
  // código reemplaza (guest.paymentMethod || paymentMethods[0]).
  defaultMethod?: PaymentMethod
  source: PaymentSource
}

export interface BulkConfirmFailure {
  guestId: string
  reason: 'not_found'
}

export interface BulkConfirmResult {
  ok: number
  failed: number
  failures: BulkConfirmFailure[]
  notifications: ConfirmPaymentNotify[]
}

// Trocea guestIds en lotes de MAX_GUESTS_PER_CHUNK (mismo margen que ya usaba
// bulkSetGuestPaymentStatus del lado del cliente, movido acá) — cada lote es
// UNA transacción que lee todos los invitados del lote y aplica un único
// delta agregado a paidCount, en vez de una transacción por invitado. Un
// guestId inexistente cuenta como `failed` en vez de saltearse en silencio.
export async function bulkConfirmGuestPayments(
  db: Firestore,
  eventId: string,
  guestIds: string[],
  target: 'paid' | 'unpaid',
  opts: BulkConfirmOptions,
): Promise<BulkConfirmResult> {
  const eventRef = db.collection('events').doc(eventId)
  const guestsCol = eventRef.collection('guests')
  const result: BulkConfirmResult = { ok: 0, failed: 0, failures: [], notifications: [] }

  for (let i = 0; i < guestIds.length; i += MAX_GUESTS_PER_CHUNK) {
    const chunk = guestIds.slice(i, i + MAX_GUESTS_PER_CHUNK)
    await db.runTransaction(async (tx) => {
      const [eventSnap, ...guestSnaps] = await Promise.all([
        tx.get(eventRef),
        ...chunk.map((id) => tx.get(guestsCol.doc(id))),
      ])
      if (!eventSnap.exists) {
        for (const id of chunk) result.failures.push({ guestId: id, reason: 'not_found' })
        result.failed += chunk.length
        return
      }
      const event = eventSnap.data()!
      let paidCountDelta = 0

      guestSnaps.forEach((guestSnap, idx) => {
        const guestId = chunk[idx]
        if (!guestSnap.exists) {
          result.failures.push({ guestId, reason: 'not_found' })
          result.failed += 1
          return
        }
        const guest = guestSnap.data()!
        const resolvedMethod = ((guest.paymentMethod as PaymentMethod | null) ?? opts.defaultMethod) || undefined
        const change = computePaymentChange(guest, target, resolvedMethod, opts.source)
        if (change.changed) {
          tx.update(guestsCol.doc(guestId), change.guestUpdates)
          paidCountDelta += change.paidCountDelta
          if (change.paidCountDelta > 0 && event.ownerId) {
            result.notifications.push({ ownerId: event.ownerId as string, eventName: (event.name as string) || '', guestName: (guest.name as string) || '' })
          }
        }
        result.ok += 1
      })

      applyCounterDeltas(db, tx, eventRef, eventId, { paidCount: paidCountDelta })
    })
  }

  return result
}
