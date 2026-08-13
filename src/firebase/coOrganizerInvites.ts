import { httpsCallable } from 'firebase/functions'
import { functions } from './config'

// Wrapper de acceptCoOrganizerInvite.ts (Cloud Function) — canjea un token ya
// generado. `createCoOrganizerInvite`/`buildCoOrganizerInviteUrl` se
// retiraron de acá (fusión coorganizador+colaborador Administrador, ver
// ROLES_PERMISSIONS_REDESIGN.md): la UI ya no genera enlaces nuevos de este
// sistema, ver CollaboratorPanel.tsx. Este wrapper se conserva porque un
// enlace /co/:eventId/:token ya compartido antes de la fusión tiene que
// seguir siendo canjeable.

export type AcceptCoOrganizerInviteResult =
  | { status: 'success'; eventName: string }
  | { status: 'already_member'; eventName: string }
  | { status: 'expired' }
  | { status: 'used' }
  | { status: 'not_found' }
  | { status: 'full' }

export async function acceptCoOrganizerInvite(eventId: string, token: string): Promise<AcceptCoOrganizerInviteResult> {
  const callable = httpsCallable<{ eventId: string; token: string }, AcceptCoOrganizerInviteResult>(functions, 'acceptCoOrganizerInvite')
  const result = await callable({ eventId, token })
  return result.data
}
