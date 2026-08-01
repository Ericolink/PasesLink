// Asignación manual del organizador ("Asignar lugar"), saltando el orden
// FIFO — misma función interna que usa la cascada automática
// (attemptPromote), invocada acá con reason: 'manual' en vez de 'fifo': una
// sola implementación, dos disparadores (ver §3 del RFC). Sigue generando
// una OFERTA, no una asignación instantánea — incluso a la persona que el
// organizador elige a mano hay que darle la chance de confirmar, no
// forzarla. La oferta no vence sola (ver promote.ts) — si nadie responde,
// el organizador la cancela a mano (cancelWaitlistOffer.ts).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { attemptPromote } from '../waitlist/promote.js'
import { sendOfferEmail } from '../waitlist/notify.js'
import { canManageGuests } from '../lib/permissions.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'

interface PromoteWaitlistEntryInput {
  eventId: string
  entryId: string
}

export const promoteWaitlistEntry = onCall<PromoteWaitlistEntryInput>({ secrets: [brevoApiKey, brevoSenderEmail] }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Necesitás iniciar sesión.')
  }
  const { eventId, entryId } = request.data || {}
  if (!eventId || !entryId) {
    throw new HttpsError('invalid-argument', 'Faltan datos para asignar el lugar.')
  }

  const db = getFirestore()
  const eventSnap = await db.collection('events').doc(eventId).get()
  if (!eventSnap.exists) {
    throw new HttpsError('not-found', 'El evento no existe.')
  }
  if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
    throw new HttpsError('permission-denied', 'No tenés permiso para gestionar la lista de espera de este evento.')
  }

  const result = await attemptPromote(db, eventId, entryId, 'manual')
  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      not_found: 'Esa entrada ya no existe.',
      not_waiting: 'Esa persona ya no está esperando (ya tiene una oferta, ya fue promovida, o se la quitó de la fila).',
      no_capacity: 'No hay lugar suficiente para el tamaño de este grupo.',
      event_too_close: 'El evento está por empezar — asigná el lugar manualmente en persona en vez de ofertarlo.',
    }
    throw new HttpsError('failed-precondition', messages[result.reason])
  }

  await sendOfferEmail(db, eventId, entryId, result.entry)

  return { ok: true }
})
