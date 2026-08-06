// Excepción del organizador: revierte una salida "definitiva" a un estado
// que vuelve a permitir reingreso por escáner — limpia `exitType` sin tocar
// `checkedOutAt` (checkInGuest se encarga de resetearlo en el reingreso
// efectivo). Reemplaza el updateDoc directo que existía antes en
// src/firebase/guests.ts:allowGuestReentry. Demasiado simple para un
// servicio separado — va directo acá.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { guestVersionFields } from '../lib/guestVersion.js'
import { canEditGuests } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface AllowGuestReentryInput {
  eventId: string
  guestId: string
}

// Sin memory/timeoutSeconds propios (hereda 256MiB/60s del default global)
// aunque el trabajo real es un solo update() de un campo — ver el mismo
// comentario en getOfferedWaitlistCount.ts: con un solo codebase, bajar la
// memoria de una función liviana rompe su cold start igual, porque carga el
// módulo completo del proyecto al arrancar, no solo su propio código.
export const allowGuestReentry = onCall<AllowGuestReentryInput>(
  { maxInstances: 5 },
  (request) => withCallableObservability(request, 'allowGuestReentry', async (ctx) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestId } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId, guestId })
    if (!eventId || !guestId) {
      throw new HttpsError('invalid-argument', 'Faltan datos para habilitar el reingreso.')
    }

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) {
      throw new HttpsError('not-found', 'El evento no existe.')
    }
    if (!canEditGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para editar invitados en este evento.')
    }

    const guestRef = eventRef.collection('guests').doc(guestId)
    const guestSnap = await guestRef.get()
    if (!guestSnap.exists) {
      throw new HttpsError('not-found', 'El invitado no existe en este evento.')
    }

    await guestRef.update({ exitType: null, ...guestVersionFields() })
    return { ok: true }
  }),
)
