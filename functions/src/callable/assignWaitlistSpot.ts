// Asignación directa del organizador ("Pasar a la lista normal"/"Marcar
// como pagado" en WaitlistPanel.tsx): crea el guest confirmado al instante,
// sin pasar por el paso de oferta+confirmación por correo (esa parte sigue
// existiendo — la cascada automática de functions/src/waitlist/cascade.ts
// dispara una oferta cuando se libera un lugar solo; el organizador puede
// además asignar directo desde acá). Reutiliza el mismo núcleo transaccional
// (promoteEntryToGuest) que ya usa confirmWaitlistOffer — la única
// diferencia real es quién autoriza la promoción: acá el organizador
// (permiso `addGuests`), en vez de un offerToken que demuestra que el
// propio invitado la aceptó. `markPaid` es lo único que distingue "pasar a
// la lista normal" de "marcar como pagado" en el menú de acciones.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { promoteEntryToGuest } from '../waitlist/promoteToGuest.js'
import { sendGuestPassEmail } from '../capacity/guestPassEmail.js'
import { hasPermission } from '../lib/permissions.js'
import type { PaymentMethod } from '../payments/confirmPayment.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface AssignWaitlistSpotInput {
  eventId: string
  entryId: string
  paymentMethod?: PaymentMethod
  /** "Marcar como pagado" del menú de la Waitlist — ver PromoteToGuestOptions.markPaid. */
  markPaid?: boolean
}

interface AssignWaitlistSpotResult {
  qrToken: string
  // Invitados corridos a la lista de espera para hacerle lugar al que se
  // asignó, si no había cupo (ver allowBumpToFit en promoteEntryToGuest) —
  // vacío cuando no hizo falta.
  bumped: { name: string; partySize: number }[]
}

// secrets/timeoutSeconds: mismo motivo que registerWalkInGuest.ts — el
// envío del pase por correo después de comprometida la transacción es una
// llamada HTTP real a Brevo (el invitado, a diferencia del flujo de oferta,
// nunca vio un link antes de esto — es la única forma en que se entera).
export const assignWaitlistSpot = onCall<AssignWaitlistSpotInput>({ secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'assignWaitlistSpot', async (ctx): Promise<AssignWaitlistSpotResult> => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, entryId, paymentMethod, markPaid } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !entryId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para asignar el lugar.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!hasPermission(eventSnap.data()!, request.auth.uid, 'addGuests', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para gestionar la lista de espera de este evento.')
    }

    const result = await promoteEntryToGuest(db, eventId, entryId, { guestUid: null, paymentMethod, markPaid, paidByUid: request.auth.uid, allowBumpToFit: true })

    if (!result.ok) {
      const messages: Record<typeof result.reason, string> = {
        not_found: 'Esa entrada ya no existe.',
        not_available: 'Esa persona ya no está en la lista de espera (ya fue promovida, declinó la oferta, o se la quitó de la fila).',
        no_capacity: 'No hay lugar suficiente, ni corriendo a los últimos registrados que no pagaron ni hicieron check-in.',
      }
      throw new HttpsError('failed-precondition', messages[result.reason])
    }

    // Best-effort, después de comprometida la transacción (mismo criterio
    // que registerWalkInGuest.ts): un fallo acá nunca debe convertir una
    // asignación exitosa en un error de cara al organizador. Sin esto, el
    // invitado no tendría forma de enterarse de que ya tiene un lugar
    // confirmado (a diferencia del flujo de oferta, nunca vio un link).
    const email = result.entry.email as string | undefined
    if (email) {
      try {
        await sendGuestPassEmail(db, {
          eventId,
          guestId: result.guestId,
          toEmail: email,
          eventName: result.eventName,
          qrToken: result.qrToken,
        })
      } catch (err) {
        ctx.logger.warn('No se pudo enviar el correo del pase tras asignar el lugar', { error: err, eventId, guestId: result.guestId })
      }
    }

    logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_PROMOTED_FROM_WAITLIST, { eventId, entryId, reason: 'organizer_direct', markPaid: markPaid === true, bumpedCount: result.bumped.length })

    return { qrToken: result.qrToken, bumped: result.bumped }
  }),
)
