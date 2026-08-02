// La mutación de mayor riesgo de todo el sistema: crea un `guests` doc real
// y puede destrabar un flujo de pago. Por eso vive acá (Callable Function,
// Admin SDK) y no como una escritura de cliente — es la pieza central de
// "menor cantidad de lógica crítica en React" (ver §3 de
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md). El cliente solo llama esta
// función y muestra el resultado.
import { randomUUID } from 'node:crypto'
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface ConfirmWaitlistOfferInput {
  eventId: string
  entryId: string
  offerToken: string
  paymentMethod?: 'transfer' | 'cash'
}

interface ConfirmWaitlistOfferResult {
  qrToken: string
}

function generateQrToken(): string {
  return randomUUID().replace(/-/g, '')
}

export const confirmWaitlistOffer = onCall<ConfirmWaitlistOfferInput>((request) =>
  withCallableObservability(request, 'confirmWaitlistOffer', async (ctx): Promise<ConfirmWaitlistOfferResult> => {
    const { eventId, entryId, offerToken, paymentMethod } = request.data || {}
    ctx.addContext({ uid: request.auth?.uid, eventId })
    if (!eventId || !entryId || !offerToken) {
      throw new HttpsError('invalid-argument', 'Faltan datos para confirmar la oferta.')
    }

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const entryRef = eventRef.collection('waitlist').doc(entryId)

    const result = await db.runTransaction(async (tx) => {
      const [eventSnap, entrySnap] = await Promise.all([tx.get(eventRef), tx.get(entryRef)])
      if (!eventSnap.exists || !entrySnap.exists) {
        throw new HttpsError('not-found', 'No se encontró la entrada de la lista de espera.')
      }

      const entry = entrySnap.data()!
      // offerToken de un solo uso, corta vida — separado de waitlistToken a
      // propósito (ver §5 del RFC): que alguien tenga el link de estado de la
      // fila no alcanza para reclamar un lugar real.
      // La oferta no vence sola (ver promote.ts) — solo puede dejar de estar
      // disponible porque el invitado ya la resolvió, o el organizador la
      // canceló (cancelWaitlistOffer.ts, vuelve la entrada a 'waiting').
      if (entry.status !== 'offered' || entry.offerToken !== offerToken) {
        throw new HttpsError('failed-precondition', 'Esta oferta ya no está disponible.')
      }

      const event = eventSnap.data()!
      const capacity = (event.capacity as number) ?? 0
      const peopleCount = (event.peopleCount as number) ?? 0
      const partySize = (entry.partySize as number) ?? 1

      // Chequeo final y autoritativo — attemptPromote (promote.ts) ya validó
      // capacidad al OFERTAR, pero esta es la única garantía real de no
      // exceder el cupo al CREAR el guest doc, mismo principio que
      // registerWalkInGuest en el cliente ("la transacción es la garantía
      // real, todo lo anterior es best-effort"). Puede fallar en el caso raro
      // de que un alta manual del organizador haya consumido el lugar
      // mientras la oferta estaba activa (§7 del RFC) — se rechaza acá en vez
      // de crear un guest que rompería el cupo. La entrada queda 'offered'
      // (no se degrada sola): el organizador puede cancelarla a mano
      // (cancelWaitlistOffer.ts) si ve que ya no tiene sentido.
      if (peopleCount + partySize > capacity) {
        throw new HttpsError('resource-exhausted', 'El evento ya no tiene lugar disponible.')
      }

      // Mismo criterio que registerWalkInGuest (capacity.ts): solo se guarda
      // un método de pago si el evento lo requiere — nunca se inventa uno
      // para un evento gratuito, y no se asume nada si el organizador tiene
      // varios métodos configurados y el cliente no mandó cuál eligió (queda
      // en null, igual que un alta con datos incompletos hoy).
      const requiresPayment = (event.requiresPayment as boolean) || false
      const resolvedPaymentMethod = requiresPayment ? paymentMethod || null : null

      const qrToken = generateQrToken()
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
        // Respuestas a los campos personalizados que ya cargó al anotarse en
        // la fila — antes se perdían acá (bug real: la lista de espera pedía
        // menos campos que el registro normal y los que sí pedía no viajaban
        // al guest final).
        customData: (entry.customData as Record<string, string>) || {},
        guestUid: request.auth?.uid ?? null,
        guestPhotoURL: null,
        // GuestData.createdAt se lee vía toMillisOrNull (espera un Timestamp,
        // no un número plano) — serverTimestamp(), igual que
        // registerWalkInGuest en el cliente, no Date.now().
        createdAt: FieldValue.serverTimestamp(),
      })

      const email = entry.email as string | undefined
      const phone = entry.phone as string | undefined
      if (email || phone) {
        tx.set(eventRef.collection('guestContacts').doc(guestRef.id), {
          email: email || '',
          phone: phone || '',
          ...(phone && entry.phoneCountry ? { phoneCountry: entry.phoneCountry } : {}),
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

      return { qrToken }
    })

    logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_PROMOTED_FROM_WAITLIST, { eventId, entryId })
    return result
  }),
)
