// Núcleo transaccional compartido: crea el `guests` doc real a partir de
// una entrada de la lista de espera y la marca 'promoted' — el mismo
// trabajo que antes vivía solo dentro de confirmWaitlistOffer.ts. Dos
// llamadores, misma garantía de capacidad/atomicidad:
//   - confirmWaitlistOffer.ts (offerToken presente): el INVITADO confirma
//     su propia oferta ('offered' + token exacto).
//   - assignWaitlistSpot.ts (sin offerToken): el ORGANIZADOR asigna el
//     lugar directo, sin pasar por oferta/confirmación por correo — acepta
//     'waiting' u 'offered' (puede saltarse una oferta activa sin
//     resolver).
import { randomUUID } from 'node:crypto'
import { FieldValue, type DocumentData, type DocumentReference, type Firestore } from 'firebase-admin/firestore'
import type { PaymentMethod } from '../payments/confirmPayment.js'

export interface PromoteToGuestOptions {
  /** uid a grabar en `guestUid` — solo tiene sentido cuando es el propio invitado quien confirma (sesión con la que abrió el link de oferta). El organizador nunca es el invitado: assignWaitlistSpot.ts siempre pasa null acá. */
  guestUid: string | null
  paymentMethod?: PaymentMethod
  /** Si se pasa: exige status 'offered' + este token exacto (el invitado confirma su propia oferta). Si se omite: acepta 'waiting' u 'offered' (asignación directa del organizador). */
  offerToken?: string
  /**
   * "Marcar como pagado" del organizador (WaitlistPanel): crea el guest ya
   * con `paymentStatus: 'paid'` en la MISMA transacción, en vez del
   * `'unpaid'` de siempre — nunca un paso aparte, para que el chequeo de
   * capacidad de acá abajo siga siendo la única puerta de entrada (evita que
   * "pagó" se convierta en una forma de saltarse el cupo). Sin efecto si el
   * evento no requiere pago.
   */
  markPaid?: boolean
  /** uid del organizador que marcó el pago (para `paidBy`) — solo tiene sentido junto con `markPaid`. */
  paidByUid?: string | null
  /**
   * Solo assignWaitlistSpot.ts (asignación en la puerta): si no hay cupo,
   * en vez de fallar corre automáticamente al último invitado registrado
   * que no haya pagado ni hecho check-in (puede correr a más de uno si el
   * grupo que llega necesita más de un lugar) — ver `bumped` en el
   * resultado. confirmWaitlistOffer.ts (oferta remota, ya reservó cupo vía
   * offeredCount al extenderse) nunca pasa esto en true.
   */
  allowBumpToFit?: boolean
}

export type PromoteToGuestResult =
  | { ok: true; qrToken: string; guestId: string; entry: DocumentData; eventName: string; bumped: { name: string; partySize: number }[] }
  | { ok: false; reason: 'not_found' | 'not_available' | 'no_capacity' }

// Mismo problema que normalizeCompanions (functions/src/checkin/shared.ts) —
// `companions` puede venir como array (invitados con acompañantes con
// nombre) o como número legacy (altas de registerWalkInGuest/este mismo
// archivo). Acá solo hace falta el conteo, no los objetos completos, así
// que no vale la pena importar esa función (no está exportada).
function guestPartySize(data: DocumentData): number {
  const companions = data.companions
  if (Array.isArray(companions)) return 1 + companions.length
  if (typeof companions === 'number' && companions > 0) return 1 + companions
  return 1
}

function rsvpCountField(status: unknown): 'rsvpYesCount' | 'rsvpNoCount' | 'rsvpPendingCount' {
  if (status === 'yes') return 'rsvpYesCount'
  if (status === 'no') return 'rsvpNoCount'
  return 'rsvpPendingCount'
}

export async function promoteEntryToGuest(
  db: Firestore,
  eventId: string,
  entryId: string,
  opts: PromoteToGuestOptions,
): Promise<PromoteToGuestResult> {
  const eventRef = db.collection('events').doc(eventId)
  const entryRef = eventRef.collection('waitlist').doc(entryId)

  return db.runTransaction(async (tx) => {
    const [eventSnap, entrySnap] = await Promise.all([tx.get(eventRef), tx.get(entryRef)])
    if (!eventSnap.exists || !entrySnap.exists) {
      return { ok: false, reason: 'not_found' }
    }

    const entry = entrySnap.data()!
    if (opts.offerToken) {
      if (entry.status !== 'offered' || entry.offerToken !== opts.offerToken) {
        return { ok: false, reason: 'not_available' }
      }
    } else if (entry.status !== 'waiting' && entry.status !== 'offered') {
      return { ok: false, reason: 'not_available' }
    }

    const event = eventSnap.data()!
    const capacity = (event.capacity as number) ?? 0
    const peopleCount = (event.peopleCount as number) ?? 0
    const partySize = (entry.partySize as number) ?? 1

    // Chequeo final y autoritativo dentro de la transacción — mismo
    // principio que registerWalkInGuest ("la transacción es la garantía
    // real"). Cubre tanto el caso de la oferta (pudo quedar vieja) como el
    // de la asignación directa (nunca pasó por attemptPromote antes).
    const bumped: { ref: DocumentReference; data: DocumentData; size: number }[] = []
    if (peopleCount + partySize > capacity) {
      if (!opts.allowBumpToFit) {
        return { ok: false, reason: 'no_capacity' }
      }

      const deficit = peopleCount + partySize - capacity
      // Lectura ANTES de cualquier write de esta transacción (regla de
      // Firestore: todas las lecturas primero) — límite generoso (50,
      // mismo criterio que COUNTER_DELTA_CAP del cliente) para no perder
      // de vista candidatos elegibles si los más recientes están
      // protegidos.
      const recentSnap = await tx.get(eventRef.collection('guests').orderBy('createdAt', 'desc').limit(50))
      let freed = 0
      for (const doc of recentSnap.docs) {
        if (freed >= deficit) break
        const data = doc.data()
        if (data.paymentStatus === 'paid' || data.status === 'checked_in') continue
        const size = guestPartySize(data)
        bumped.push({ ref: doc.ref, data, size })
        freed += size
      }
      if (freed < deficit) {
        return { ok: false, reason: 'no_capacity' }
      }
    }

    // Mismo criterio que registerWalkInGuest (capacity.ts): solo se guarda
    // un método de pago si el evento lo requiere.
    const requiresPayment = (event.requiresPayment as boolean) || false
    const resolvedPaymentMethod = requiresPayment ? opts.paymentMethod || null : null
    const markPaid = requiresPayment && opts.markPaid === true

    const qrToken = randomUUID().replace(/-/g, '')
    const guestRef = eventRef.collection('guests').doc()
    tx.set(guestRef, {
      name: entry.name,
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      // Formato numérico legacy, mismo que registerWalkInGuest — normalizeCompanions
      // en src/firebase/guests.ts ya sabe traducirlo a companions.length.
      companions: Math.max(partySize - 1, 0),
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      exitType: null,
      lockToken: null,
      notes: '',
      paymentStatus: markPaid ? 'paid' : 'unpaid',
      paymentMethod: resolvedPaymentMethod,
      // Date.now() (número), no FieldValue.serverTimestamp(): mismo formato
      // que confirmPayment.ts (guestUpdates.paidAt = Date.now()) — GuestData.paidAt
      // se lee como `number | null` en todo el resto de la app.
      ...(markPaid ? { paidAt: Date.now(), paidBy: opts.paidByUid ?? null } : {}),
      holdExpiresAt: null,
      customData: (entry.customData as Record<string, string>) || {},
      // Se propaga el origen de la entrada de waitlist (ver
      // WaitlistEntryData.registrationSource / GuestData.registrationSource)
      // — no se reevalúa acá. Ausente (entrada creada antes de este campo)
      // cae a 'organizer', mismo default permisivo que el resto del modelo.
      registrationSource: entry.registrationSource === 'self' ? 'self' : 'organizer',
      guestUid: opts.guestUid,
      guestPhotoURL: null,
      createdAt: FieldValue.serverTimestamp(),
    })

    const email = entry.email as string | undefined
    const phone = entry.phone as string | undefined
    if (email || phone) {
      tx.set(eventRef.collection('guestContacts').doc(guestRef.id), {
        email: email || '',
        phone: phone || '',
        ...(phone && entry.phoneCountry ? { phoneCountry: entry.phoneCountry } : {}),
        // El teléfono de una entrada de waitlist siempre lo tecleó el propio
        // invitado al anotarse (ver WaitlistEntryData.whatsappConsent) — se
        // propaga tal cual, no se reevalúa.
        ...(phone && entry.whatsappConsent ? { whatsappConsent: true } : {}),
      })
    }

    // Deltas del invitado que entra (arriba) + de los que se corren a la
    // waitlist para hacerle lugar (abajo, si allowBumpToFit lo activó) —
    // un único tx.update(eventRef, ...) con el neto de ambos, nunca dos
    // escrituras separadas al mismo documento en la misma transacción.
    let guestCountDelta = 1
    let peopleCountDelta = partySize
    let rsvpYesCountDelta = 1
    let rsvpNoCountDelta = 0
    let rsvpPendingCountDelta = 0

    for (const candidate of bumped) {
      const data = candidate.data
      const fullName = `${data.name || ''}${data.lastName ? ` ${data.lastName}` : ''}`.trim()
      tx.delete(candidate.ref)
      tx.delete(eventRef.collection('guestContacts').doc(candidate.ref.id))
      tx.set(eventRef.collection('waitlist').doc(), {
        name: fullName,
        partySize: candidate.size,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.phoneCountry ? { phoneCountry: data.phoneCountry } : {}),
        ...(data.email ? { email: data.email } : {}),
        ...(data.whatsappConsent ? { whatsappConsent: true } : {}),
        ...(data.customData && Object.keys(data.customData).length > 0 ? { customData: data.customData } : {}),
        waitlistToken: randomUUID().replace(/-/g, ''),
        status: 'waiting',
        priorityBoost: 0,
        createdAt: FieldValue.serverTimestamp(),
        offerToken: null,
        offerExpiresAt: null,
        respondedAt: null,
        promotedGuestId: null,
        promotionReason: null,
        registrationSource: data.registrationSource === 'self' ? 'self' : 'organizer',
      })
      guestCountDelta -= 1
      peopleCountDelta -= candidate.size
      const field = rsvpCountField(data.rsvpStatus)
      if (field === 'rsvpYesCount') rsvpYesCountDelta -= 1
      else if (field === 'rsvpNoCount') rsvpNoCountDelta -= 1
      else rsvpPendingCountDelta -= 1
    }

    tx.update(eventRef, {
      guestCount: ((event.guestCount as number) ?? 0) + guestCountDelta,
      peopleCount: peopleCount + peopleCountDelta,
      rsvpYesCount: ((event.rsvpYesCount as number) ?? 0) + rsvpYesCountDelta,
      ...(rsvpNoCountDelta !== 0 ? { rsvpNoCount: ((event.rsvpNoCount as number) ?? 0) + rsvpNoCountDelta } : {}),
      ...(rsvpPendingCountDelta !== 0 ? { rsvpPendingCount: ((event.rsvpPendingCount as number) ?? 0) + rsvpPendingCountDelta } : {}),
    })

    tx.update(entryRef, {
      status: 'promoted',
      promotedGuestId: guestRef.id,
      respondedAt: Date.now(),
    })

    return {
      ok: true,
      qrToken,
      guestId: guestRef.id,
      entry,
      eventName: (event.name as string) || 'tu evento',
      bumped: bumped.map((c) => ({ name: (c.data.name as string) || '', partySize: c.size })),
    }
  })
}
