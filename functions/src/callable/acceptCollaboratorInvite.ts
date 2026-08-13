// Canjea un token de invitación de colaborador (ver createCollaboratorInvite.ts)
// y suma a quien llama a event.collaborators con el rol elegido por quien
// invitó — reemplazo unificado (Fase 3 de ROLES_PERMISSIONS_REDESIGN.md) de
// acceptCoOrganizerInvite.ts/acceptConcessionsStaffInvite.ts. A diferencia de
// concesiones (que MERGEA roles cashier/prep), acá cada colaborador tiene un
// solo `role` — aceptar una invitación cuando ya se es colaborador de
// cualquier tipo es idempotente (no reemplaza el rol existente), mismo
// criterio que ya usa el flujo de coorganizador.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { withCallableObservability } from '../lib/observability/withObservability.js'
import { BUSINESS_EVENTS, logBusinessEvent } from '../lib/observability/businessEvents.js'
import type { CollaboratorPermission, CollaboratorRole } from '../lib/permissions.js'

// Mismo tope que createCollaboratorInvite.ts — revalidado acá porque entre
// que se generó el enlace y que alguien lo abre puede haber pasado
// cualquier cosa (otros colaboradores agregados mientras tanto).
const EVENT_COLLABORATORS_MAX = 20

interface AcceptCollaboratorInviteInput {
  eventId: string
  token: string
}

export type AcceptCollaboratorInviteResponse =
  | { status: 'success'; eventName: string; role: CollaboratorRole }
  | { status: 'already_member'; eventName: string }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }
  | { status: 'full' }

export const acceptCollaboratorInvite = onCall<AcceptCollaboratorInviteInput>(
  { timeoutSeconds: 20 },
  (request) => withCallableObservability(request, 'acceptCollaboratorInvite', async (ctx): Promise<AcceptCollaboratorInviteResponse> => {
    if (!request.auth) throw new HttpsError('unauthenticated', 'Necesitas iniciar sesión.')
    const { eventId, token } = request.data || {}
    const uid = request.auth.uid
    ctx.addContext({ uid, eventId })
    if (!eventId || !token) throw new HttpsError('invalid-argument', 'Falta el token de invitación.')

    const db = getFirestore()
    const eventRef = db.collection('events').doc(eventId)
    const inviteRef = eventRef.collection('collaboratorInvites').doc(String(token))
    const userRef = db.collection('users').doc(uid)

    const result = await db.runTransaction(async (tx): Promise<AcceptCollaboratorInviteResponse> => {
      const [eventSnap, inviteSnap, userSnap] = await Promise.all([
        tx.get(eventRef),
        tx.get(inviteRef),
        tx.get(userRef),
      ])

      if (!eventSnap.exists) throw new HttpsError('not-found', 'El evento no existe.')
      if (!inviteSnap.exists) return { status: 'not_found' }

      const event = eventSnap.data()!
      const invite = inviteSnap.data()!
      const eventName = (event.name as string) || 'este evento'

      if (invite.usedBy) return { status: 'used' }
      const expiresAt = invite.expiresAt as Timestamp
      if (expiresAt.toMillis() < Date.now()) return { status: 'expired' }

      const coOrganizersMap = (event.coOrganizersMap as Record<string, unknown> | undefined) || {}
      const collaborators = (event.collaborators as Record<string, unknown> | undefined) || {}
      // Ya es dueño, coorganizador legacy, o ya tiene una entrada en el
      // sistema nuevo (de cualquier rol) — idempotente, no reemplaza nada.
      if (uid === event.ownerId || uid in coOrganizersMap || uid in collaborators) {
        tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })
        return { status: 'already_member', eventName }
      }
      if (Object.keys(collaborators).length >= EVENT_COLLABORATORS_MAX) {
        return { status: 'full' }
      }

      const email = (userSnap.data()?.email as string | undefined) || request.auth!.token.email || ''
      const role = invite.role as CollaboratorRole
      const permissionOverrides = invite.permissionOverrides as Partial<Record<CollaboratorPermission, boolean>> | null

      const entry: Record<string, unknown> = {
        email,
        role,
        invitedBy: invite.createdBy,
        invitedAt: FieldValue.serverTimestamp(),
      }
      if (permissionOverrides) entry.permissionOverrides = permissionOverrides

      tx.update(eventRef, { [`collaborators.${uid}`]: entry })
      tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() })

      return { status: 'success', eventName, role }
    })

    if (result.status === 'success') {
      logBusinessEvent(ctx.logger, BUSINESS_EVENTS.COLLABORATOR_INVITE_ACCEPTED, { eventId, uid, role: result.role })
    }
    return result
  }),
)
