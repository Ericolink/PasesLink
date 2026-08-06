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

// memory/timeoutSeconds bajos: un solo update() de un campo, sin
// transacción ni llamadas externas — la función más liviana del camino del
// escáner. region ya sale del default global (index.ts).
export const allowGuestReentry = onCall<AllowGuestReentryInput>(
  { maxInstances: 5, memory: '128MiB', timeoutSeconds: 15 },
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
