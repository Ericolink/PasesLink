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
import { FieldValue, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import type { PaymentMethod } from '../payments/confirmPayment.js'

export interface PromoteToGuestOptions {
  /** uid a grabar en `guestUid` — solo tiene sentido cuando es el propio invitado quien confirma (sesión con la que abrió el link de oferta). El organizador nunca es el invitado: assignWaitlistSpot.ts siempre pasa null acá. */
  guestUid: string | null
  paymentMethod?: PaymentMethod
  /** Si se pasa: exige status 'offered' + este token exacto (el invitado confirma su propia oferta). Si se omite: acepta 'waiting' u 'offered' (asignación directa del organizador). */
  offerToken?: string
}

export type PromoteToGuestResult =
  | { ok: true; qrToken: string; guestId: string; entry: DocumentData; eventName: string }
  | { ok: false; reason: 'not_found' | 'not_available' | 'no_capacity' }

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
    if (peopleCount + partySize > capacity) {
      return { ok: false, reason: 'no_capacity' }
    }

    // Mismo criterio que registerWalkInGuest (capacity.ts): solo se guarda
    // un método de pago si el evento lo requiere.
    const requiresPayment = (event.requiresPayment as boolean) || false
    const resolvedPaymentMethod = requiresPayment ? opts.paymentMethod || null : null

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
      paymentStatus: 'unpaid',
      paymentMethod: resolvedPaymentMethod,
      holdExpiresAt: null,
      customData: (entry.customData as Record<string, string>) || {},
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

    tx.update(eventRef, {
      guestCount: ((event.guestCount as number) ?? 0) + 1,
      peopleCount: peopleCount + partySize,
      rsvpYesCount: ((event.rsvpYesCount as number) ?? 0) + 1,
    })

    tx.update(entryRef, {
      status: 'promoted',
      promotedGuestId: guestRef.id,
      respondedAt: Date.now(),
    })

    return { ok: true, qrToken, guestId: guestRef.id, entry, eventName: (event.name as string) || 'tu evento' }
  })
}
