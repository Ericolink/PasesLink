// Import de invitados desde CSV (ver GuestAddForm.tsx + src/utils/csvImport.ts,
// que arma este array de filas a partir del archivo) — mismo reemplazo que
// addGuestsBulk.ts, pero cada fila puede traer apellido/teléfono/email por
// separado (el CSV sí distingue columnas; pegar una lista de nombres no).
// Comparte createGuestsWithCapacity (functions/src/capacity/createGuests.ts)
// con addGuest/addGuestsBulk: mismo cupo, mismo criterio de lista de espera,
// mismos contadores.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore } from 'firebase-admin/firestore'
import { createGuestsWithCapacity, type GuestWrite } from '../capacity/createGuests.js'
import { canManageGuests } from '../lib/permissions.js'
import {
  GUEST_EMAIL_MAX,
  GUEST_NAME_PART_MAX,
  GUEST_PHONE_MAX,
  GuestValidationError,
  requireMaxLength,
  requireNonEmpty,
  requireValidEmail,
} from '../lib/guestValidation.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'

interface ImportedGuestRowInput {
  name: string
  lastName?: string
  phone?: string
  email?: string
}

interface AddGuestsFromRowsInput {
  eventId: string
  rows: ImportedGuestRowInput[]
}

export interface AddGuestsFromRowsResponse {
  added: number
  skippedNames: string[]
}

// Mismo criterio que addGuestsBulk.ts.
const MAX_GUESTS_PER_CALL = 2000

// timeoutSeconds por encima del default: mismo motivo que addGuestsBulk.ts
// (hasta 40 transacciones secuenciales de a 50 filas, tope de 2000 filas).
export const addGuestsFromRows = onCall<AddGuestsFromRowsInput>({ timeoutSeconds: 120 }, (request) =>
  withCallableObservability(request, 'addGuestsFromRows', async (ctx): Promise<AddGuestsFromRowsResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, rows } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId })
    if (!eventId || !Array.isArray(rows) || rows.length === 0) {
      throw new HttpsError('invalid-argument', 'Faltan datos para importar a los invitados.')
    }
    if (rows.length > MAX_GUESTS_PER_CALL) {
      throw new HttpsError('invalid-argument', 'Demasiados invitados en una sola operación.')
    }

    const db = getFirestore()
    const eventSnap = await db.collection('events').doc(eventId).get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    if (!canManageGuests(eventSnap.data()!, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para agregar invitados a este evento.')
    }

    try {
      // Misma garantía que addGuestsBulk: se valida el archivo completo
      // antes de escribir el primer lote.
      const guestWrites: GuestWrite[] = rows.map((row) => {
        const name = requireMaxLength(requireNonEmpty(row.name, 'El nombre'), GUEST_NAME_PART_MAX, 'El nombre')
        const lastName = row.lastName?.trim()
          ? requireMaxLength(row.lastName.trim(), GUEST_NAME_PART_MAX, 'El apellido')
          : ''
        const phone = row.phone?.trim() ? requireMaxLength(row.phone.trim(), GUEST_PHONE_MAX, 'El teléfono') : ''
        // Minúsculas: permite que reclaimInvitationsByEmail encuentre este
        // contacto por igualdad exacta contra el email verificado de la
        // cuenta — mismo criterio que registerWalkInGuest.ts.
        const email = row.email?.trim()
          ? requireMaxLength(requireValidEmail(row.email.trim().toLowerCase(), 'El email'), GUEST_EMAIL_MAX, 'El email')
          : ''
        return {
          name,
          lastName,
          companions: [],
          contact: (phone || email) ? { phone: phone || undefined, email: email || undefined } : undefined,
        }
      })

      const result = await createGuestsWithCapacity(db, eventId, guestWrites, 'best-fit')
      const skippedNames = result.skipped.map((g) => `${g.name} ${g.lastName || ''}`.trim())
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.GUEST_ADDED_BULK, { eventId, source: 'csv_import', added: result.createdIds.length, skipped: skippedNames.length })
      return { added: result.createdIds.length, skippedNames }
    } catch (err) {
      if (err instanceof GuestValidationError) throw new HttpsError('invalid-argument', err.message)
      throw err
    }
  }),
)
