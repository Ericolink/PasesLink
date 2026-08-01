// Excepción del organizador: revierte una salida "definitiva" a un estado
// que vuelve a permitir reingreso por escáner — limpia `exitType` sin tocar
// `checkedOutAt` (checkInGuest se encarga de resetearlo en el reingreso
// efectivo). Reemplaza el updateDoc directo que existía antes en
// src/firebase/guests.ts:allowGuestReentry. Demasiado simple para un
// servicio separado — va directo acá.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { canEditGuests } from '../lib/permissions.js'

interface AllowGuestReentryInput {
  eventId: string
  guestId: string
}

export const allowGuestReentry = onCall<AllowGuestReentryInput>(
  { region: 'us-central1', maxInstances: 5 },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    }
    const { eventId, guestId } = request.data || {}
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

    await guestRef.update({ exitType: null })
    return { ok: true }
  },
)
