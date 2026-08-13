// Genera un enlace/código de invitación de colaborador — reemplazo unificado
// (Fase 3 de ROLES_PERMISSIONS_REDESIGN.md) de createCoOrganizerInvite.ts y
// createConcessionsStaffInvite.ts, que se conservan mientras dure la
// migración (los coorganizadores y encargados de ventas existentes siguen
// funcionando igual). El anfitrión elige un ROL (administrador/recepción/
// caja/ventas/preparación, ver src/types/collaboratorPermissions.ts) en vez
// de un conjunto de booleanos sueltos o un alta directa por email.
//
// El token vive en events/{eventId}/collaboratorInvites/{token}, ilegible
// desde el cliente (firestore.rules: read/write false en esa subcolección) —
// solo se crea acá y se canjea en acceptCollaboratorInvite.ts, nunca por una
// escritura directa del navegador.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { randomUUID } from 'node:crypto'
import {
  COLLABORATOR_PERMISSION_KEYS,
  COLLABORATOR_ROLES,
  hasPermission,
  type CollaboratorPermission,
  type CollaboratorRole,
} from '../lib/permissions.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

// Mismo tope que EVENT_CO_ORGANIZERS_MAX/EVENT_CONCESSIONS_STAFF_INVITES_MAX
// — cuenta colaboradores ya sumados (event.collaborators) + invitaciones
// pendientes de ESTE sistema únicamente (no de los legacy, que tienen su
// propio tope independiente mientras dure la migración).
const EVENT_COLLABORATORS_MAX = 20
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 días

interface CreateCollaboratorInviteInput {
  eventId: string
  role: CollaboratorRole
  permissionOverrides?: Partial<Record<CollaboratorPermission, boolean>>
}

export type CreateCollaboratorInviteResponse =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

function isValidPermissionOverrides(value: unknown): value is Partial<Record<CollaboratorPermission, boolean>> {
  if (value == null) return true
  if (typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value as Record<string, unknown>).every(
    ([key, val]) => COLLABORATOR_PERMISSION_KEYS.includes(key as CollaboratorPermission) && typeof val === 'boolean',
  )
}

export const createCollaboratorInvite = onCall<CreateCollaboratorInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'createCollaboratorInvite', async (ctx): Promise<CreateCollaboratorInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, role, permissionOverrides } = request.data || {}
    ctx.addContext({ uid: request.auth.uid, eventId, role })
    if (!eventId) throw new HttpsError('invalid-argument', 'Falta el evento.')
    if (!COLLABORATOR_ROLES.includes(role)) throw new HttpsError('invalid-argument', 'Rol inválido.')
    if (!isValidPermissionOverrides(permissionOverrides)) {
      throw new HttpsError('invalid-argument', 'Permisos personalizados inválidos.')
    }

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const eventSnap = await eventRef.get()
    if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
    const event = eventSnap.data()!
    // Invitar colaboradores de CUALQUIER rol requiere manageCoOrganizers —
    // mismo permiso que ya gatea invitar coorganizadores/encargados de
    // ventas hoy (ver ROLES_PERMISSIONS_REDESIGN.md §2.5: no se dividió en
    // permisos "collaborators.invite" separados en esta fase).
    if (!hasPermission(event, request.auth.uid, 'manageCoOrganizers', { isAdmin: request.auth.token.admin === true })) {
      throw new HttpsError('permission-denied', 'No tienes permiso para invitar colaboradores a este evento.')
    }

    const collaborators = (event.collaborators as Record<string, unknown> | undefined) || {}
    const invitesCol = eventRef.collection('collaboratorInvites')

    // Mismo criterio que los dos sistemas legacy: cuenta colaboradores ya
    // sumados + invitaciones pendientes (sin canjear), sin filtrar por
    // vencidas (evita un índice compuesto por un caso límite raro) — en el
    // peor caso, una invitación vieja sin canjear se cuenta de más, nunca de
    // menos.
    const pendingSnap = await invitesCol.where('usedBy', '==', null).count().get()
    const pendingCount = pendingSnap.data().count
    if (Object.keys(collaborators).length + pendingCount >= EVENT_COLLABORATORS_MAX) {
      return { status: 'full' }
    }

    const token = randomUUID().replace(/-/g, '')
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS)
    await invitesCol.doc(token).set({
      createdBy: request.auth.uid,
      createdByEmail: request.auth.token.email || null,
      role,
      permissionOverrides: permissionOverrides || null,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt,
      usedBy: null,
      usedAt: null,
    })

    return { status: 'success', token, expiresAt: expiresAt.getTime() }
  }),
)
