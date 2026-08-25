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
import { hasPermission } from '../lib/permissions.js'
import {
  type CustomFieldDef,
  GUEST_FULL_NAME_MAX,
  GUEST_GROUP_MAX_MEMBERS,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  resolveMaxCompanions,
  validateOrganizerCompanions,
  validatePublicCustomData,
} from '../lib/guestValidation.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface CompanionInput {
  name?: string
  lastName?: string
  phone?: string
  phoneCountry?: string
  customData?: Record<string, string>
}

interface AddGuestInput {
  eventId: string
  name: string
  lastName?: string
  phone?: string
  phoneCountry?: string
  companions?: CompanionInput[]
  isGroup?: boolean
  // Etiqueta libre del grupo (ej. "Familia Muñoz") — solo tiene efecto con
  // isGroup: true, ver GuestWrite.groupLabel.
  groupLabel?: string
  customData?: Record<string, string>
}

export type AddGuestResponse = { status: 'success'; id: string } | { status: 'full' }

// timeoutSeconds bajo: transacción acotada (createGuestsWithCapacity con
// un solo invitado), sin llamadas externas.
//
// 2026-08-08: el binding IAM público (roles/run.invoker → allUsers) del
// servicio de Cloud Run subyacente no quedó aplicado en el deploy original
// (causaba 403 sin headers CORS en el preflight OPTIONS). Firebase CLI solo
// asigna ese binding al CREAR la función — nunca en updates posteriores — y
// la opción `invoker` de onCall() no aplica a funciones callable (solo a
// httpsTrigger), así que no es reparable con `firebase deploy` ni desde
// código. Se reaplicó manualmente vía la API de Cloud Run
// (services/addguest:setIamPolicy). Si el síntoma vuelve a aparecer, hay
// que repetir ese setIamPolicy directo, no solo redeployar.
export const addGuest = onCall<AddGuestInput>({ timeoutSeconds: 20 }, (request) =>
  withCallableObservability(request, 'addGuest', async (ctx): Promise<AddGuestResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, name, lastName, phone, phoneCountry, companions, isGroup, groupLabel, customData } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !name) {
      throw new HttpsError('invalid-argument', 'Faltan datos para agregar al invitado.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    const event = eventSnap.data()!
    if (!hasPermission(event, request.auth.uid, 'addGuests', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para agregar invitados a este evento.')
    }

    try {
      const trimmedName = requireMaxLength(requireNonEmpty(name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
      // Una familia/grupo (isGroup) representa personas reales desde este
      // formulario (ver GuestAddForm.tsx, tab "Familia o grupo") — a
      // diferencia del invitado individual de arriba, acá el apellido del
      // primer integrante SÍ es obligatorio (igual que el de cada
      // acompañante nombrado, ver el chequeo de companionsList más abajo).
      const trimmedLastName = isGroup
        ? requireMaxLength(requireNonEmpty(lastName || '', 'El apellido'), GUEST_NAME_PART_MAX, 'El apellido')
        : lastName?.trim()
          ? requireMaxLength(lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
          : ''
      const trimmedGroupLabel = isGroup && groupLabel?.trim()
        ? requireMaxLength(groupLabel.trim(), GUEST_FULL_NAME_MAX, 'El nombre de la familia o grupo')
        : undefined
      const trimmedPhone = phone?.trim() ? requireMaxLength(phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''

      // Unificación Lista/Auto-registro (rediseño del Dashboard del Evento):
      // antes solo se chequeaba el largo máximo de cada valor; ahora se
      // valida contra la definición REAL de campos del evento (mismo
      // validador que ya usa registerWalkInGuest para el auto-registro
      // público) — un campo marcado "requerido" se exige igual sin importar
      // quién cargue al invitado.
      const customFieldDefs = (event.customFields as CustomFieldDef[] | undefined) || []
      const validatedCustomData = validatePublicCustomData(customData, customFieldDefs)

      // Techo real de acompañantes: antes solo regía GUEST_MAX_COMPANIONS
      // (techo técnico); ahora también respeta EventData.maxCompanions,
      // igual que auto-registro — pero SOLO para acompañantes individuales
      // (isGroup: false). Una "familia o grupo" (isGroup: true) es un
      // concepto distinto: no está sujeta a EventData.maxCompanions, sino a
      // su propio techo GUEST_GROUP_MAX_MEMBERS (- 1, porque el primer
      // integrante va en `name`/`lastName`, no en `companions`) — antes acá
      // se usaba por error GUEST_MAX_COMPANIONS (20), un techo pensado para
      // acompañantes individuales, más bajo que el que el propio formulario
      // ya le prometía al organizador (hasta 50 integrantes, ver
      // GUEST_GROUP_MAX_MEMBERS en src/utils/validation.ts) — corregido acá.
      // Nombre/apellido del acompañante son opcionales en
      // validateOrganizerCompanions (uso legítimo: sumar acompañantes solo
      // para el conteo, ej. "Juan +3") pero SE EXIGEN justo abajo cuando
      // isGroup: cada integrante de una familia/grupo es una persona real
      // con nombre propio (ver GuestAddForm.tsx).
      const maxCompanions = isGroup
        ? GUEST_GROUP_MAX_MEMBERS - 1
        : resolveMaxCompanions(event.maxCompanions as number | undefined)
      const companionsList = validateOrganizerCompanions(companions, maxCompanions, customFieldDefs)
      if (isGroup) {
        companionsList.forEach((c, index) => {
          if (!c.name?.trim() || !c.lastName?.trim()) {
            throw new GuestValidationError(`El integrante ${index + 2} debe tener nombre y apellido.`)
          }
        })
      }

      const guestWrite: GuestWrite = {
        name: trimmedName,
        lastName: trimmedLastName,
        isGroup: isGroup || false,
        groupLabel: trimmedGroupLabel,
        customData: validatedCustomData,
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
