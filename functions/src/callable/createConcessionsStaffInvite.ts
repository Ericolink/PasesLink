// Genera un enlace/código de invitación para sumar un encargado de "Ventas
// del evento" (caja o preparación) — mismo patrón que
// createCoOrganizerInvite.ts, pero el encargado nunca entra a
// `coOrganizersMap`: sigue siendo un rol aparte, sin acceso a
// invitados/reportes/configuración del evento (ver ConcessionsStaffEntry en
// src/types/concessions.ts).
//
// El token vive en events/{eventId}/concessionsStaffInvites/{token},
// ilegible desde el cliente (firestore.rules: read/write false en esa
// subcolección) — solo se crea acá y se canjea en
// acceptConcessionsStaffInvite.ts, nunca por una escritura directa del
// navegador.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import { canManageConcessions } from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

type ConcessionsStaffRole = 'cashier' | 'prep'

// Tope generoso, mismo espíritu que EVENT_CO_ORGANIZERS_MAX — evita
// invitaciones sin control, no un límite operativo real (un evento típico
// tiene 1-3 encargados por rol).
const EVENT_CONCESSIONS_STAFF_INVITES_MAX = 20
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

interface CreateConcessionsStaffInviteInput {
  eventId: string
  role: ConcessionsStaffRole
}

export type CreateConcessionsStaffInviteResponse =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

export const createConcessionsStaffInvite = onCall<CreateConcessionsStaffInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'createConcessionsStaffInvite', async (ctx): Promise<CreateConcessionsStaffInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, role } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId, role })
    if (!eventId) throw new HttpsError('invalid-argument', 'Falta el evento.')
    if (role !== 'cashier' && role !== 'prep') throw new HttpsError('invalid-argument', 'Rol inválido.')

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    const event = eventSnap.data()!
    if (!canManageConcessions(event, request.auth.uid)) {
      throw new HttpsError('permission-denied', 'No tienes permiso para invitar encargados en este evento.')
    }

    const invitesCol = eventRef.collection('concessionsStaffInvites')
    const pendingSnap = await invitesCol.where('usedBy', '==', null).count().get()
    if (pendingSnap.data().count >= EVENT_CONCESSIONS_STAFF_INVITES_MAX) {
      return { status: 'full' }
    }

    const token = randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await invitesCol.doc(token).set({
      createdBy: request.auth.uid,
      createdByEmail: request.auth.token.email || null,
      role,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      usedBy: null,
      usedAt: null,
    })

    return { status: 'success', token, expiresAt: expiresAt.getTime() }
  }),
)
