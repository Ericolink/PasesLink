// Alta individual de UN invitado por el organizador/coanfitrión — reemplaza
// la runTransaction de cliente que existía antes en src/firebase/guests.ts.
// Toda la lógica de cupo (incluida la lectura de ofertas activas de lista de
// espera) vive ahora en createGuestsWithCapacity (functions/src/capacity/
// createGuests.ts), compartida con addGuestsBulk/addGuestsFromRows.
//
// Igual que registerWalkInGuest: "cupo lleno" es un resultado esperado del
// flujo, no un error técnico — se devuelve `{ status: 'full' }` en la
// respuesta normal (el cliente lo traduce a CapacityFullError, ver
// src/firebase/guests.ts), reservando HttpsError para errores de verdad
// (forma inválida, sin permiso, evento inexistente).
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { CapacityFullError, createGuestsWithCapacity, type GuestWrite } from '../capacity/createGuests.js'
import { canManageGuests } from '../lib/permissions.js'
import {
  GUEST_CUSTOM_FIELD_VALUE_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  resolveMaxCompanions,
} from '../lib/guestValidation.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface CompanionInput {
  name?: string
  lastName?: string
  phone?: string
  phoneCountry?: string
}

interface AddGuestInput {
  eventId: string
  name: string
  lastName?: string
  phone?: string
  phoneCountry?: string
  companions?: CompanionInput[]
  isGroup?: boolean
  customData?: Record<string, string>
}

export type AddGuestResponse = { status: 'success'; id: string } | { status: 'full' }

export const addGuest = onCall<AddGuestInput>((request) =>
  withCallableObservability(request, 'addGuest', async (ctx): Promise<AddGuestResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, name, lastName, phone, phoneCountry, companions, isGroup, customData } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !name) {
      throw new HttpsError('invalid-argument', 'Faltan datos para agregar al invitado.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    const event = eventSnap.data()!
    if (!canManageGuests(event, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para agregar invitados a este evento.')
    }

    try {
      const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
      const trimmedLastName = lastName?.trim()
        ? requireMaxLength(lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
        : ''
      const trimmedPhone = phone?.trim() ? requireMaxLength(phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
      for (const value of Object.values(customData || {})) {
        requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos personalizados')
      }

      const maxCompanions = resolveMaxCompanions(event.maxCompanions as number | undefined)
      const companionsList = companions || []
      if (!isGroup && companionsList.length > maxCompanions) {
        throw new GuestValidationError(
          maxCompanions > 0
            ? `Este evento permite hasta ${maxCompanions} acompañante${maxCompanions === 1 ? '' : 's'} por invitado.`
            : 'Este evento no permite acompañantes.',
        )
      }

      const guestWrite: GuestWrite = {
        name: trimmedName,
        lastName: trimmedLastName,
        isGroup: isGroup || false,
        customData: customData || {},
        companions: companionsList,
        contact: trimmedPhone ? { phone: trimmedPhone, phoneCountry } : undefined,
      }

      const result = await createGuestsWithCapacity(db, eventId, [guestWrite], 'strict')
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_ADDED_MANUAL, { eventId, guestId: result.createdIds[0] })
      return { status: 'success', id: result.createdIds[0] }
    } catch (err) {
      if (err instanceof GuestValidationError) throw new HttpsError('invalid-argument', err.message)
      if (err instanceof CapacityFullError) return { status: 'full' }
      throw err
    }
  }),
)
