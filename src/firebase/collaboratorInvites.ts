import { httpsCallable } from 'firebase/functions'
import { functions } from './config'
import type { CollaboratorRole, EventCollaboratorPermissions } from '../types/collaboratorPermissions'

// Wrappers finos de las dos Cloud Functions que manejan el ciclo de vida
// completo del enlace de invitación de colaborador (crear/canjear) — ver
// functions/src/callable/createCollaboratorInvite.ts y
// acceptCollaboratorInvite.ts. Reemplazo unificado (Fase 4 de
// ROLES_PERMISSIONS_REDESIGN.md) de coOrganizerInvites.ts/
// concessionsStaffInvites.ts, que se conservan mientras dure la migración.

export type CreateCollaboratorInviteResult =
  | { status: 'success'; token: string; expiresAt: number }
  | { status: 'full' }

export async function createCollaboratorInvite(
  eventId: string,
  role: CollaboratorRole,
  permissionOverrides?: Partial<EventCollaboratorPermissions>,
): Promise<CreateCollaboratorInviteResult> {
  const callable = httpsCallable<
    { eventId: string; role: CollaboratorRole; permissionOverrides?: Partial<EventCollaboratorPermissions> },
    CreateCollaboratorInviteResult
  >(functions, 'createCollaboratorInvite')
  const result = await callable({ eventId, role, permissionOverrides })
  return result.data
}

export type AcceptCollaboratorInviteResult =
  | { status: 'success'; eventName: string; role: CollaboratorRole }
  | { status: 'already_member'; eventName: string }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }
  | { status: 'full' }

export async function acceptCollaboratorInvite(eventId: string, token: string): Promise<AcceptCollaboratorInviteResult> {
  const callable = httpsCallable<{ eventId: string; token: string }, AcceptCollaboratorInviteResult>(functions, 'acceptCollaboratorInvite')
  const result = await callable({ eventId, token })
  return result.data
}

// Enlace corto que se comparte/muestra en QR — el rol viaja como query param
// SOLO para poder mostrar la lista de permisos concretos en
// AcceptCollaboratorInvite.tsx antes de aceptar (el documento real de la
// invitación es ilegible desde el cliente, ver firestore.rules). No es una
// fuente de autorización: acceptCollaboratorInvite siempre usa el `role`
// guardado en el propio documento de invitación, nunca este query param —
// alguien que edite la URL a mano solo vería un texto informativo incorrecto,
// nunca obtiene un rol distinto al que el organizador generó.
export function buildCollaboratorInviteUrl(eventId: string, token: string, role: CollaboratorRole): string {
  return `${window.location.origin}/collab/${eventId}/${token}?role=${role}`
}
