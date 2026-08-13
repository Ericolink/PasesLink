import { leaveCoOrganizer, removeCoOrganizer, updateCoOrganizerPermissions } from '../firebase/events'
import type { CoOrganizerPermissions } from '../types/coOrganizerPermissions'

// Extraído de EventDetail.tsx (Subfase 3.3): editar/quitar co-organizadores
// YA EXISTENTES. La generación de enlaces nuevos se retiró de acá (fusión
// coorganizador+colaborador Administrador, ver ROLES_PERMISSIONS_REDESIGN.md
// y CollaboratorPanel.tsx) — cualquier alta nueva pasa por el sistema
// unificado (useCollaborators/createCollaboratorInvite, rol 'administrador'
// entre las opciones). `createCoOrganizerInvite`/`acceptCoOrganizerInvite`
// (Cloud Functions) siguen existiendo del lado servidor: un enlace viejo ya
// compartido antes de esta fusión tiene que seguir funcionando.
export function useCoOrganizers(eventId: string | undefined) {
  // Quita a OTRO co-organizador (dueño, o co-org con manageCoOrganizers).
  async function handleRemoveCoOrg(uid: string) {
    if (!eventId) return
    await removeCoOrganizer(eventId, uid)
  }

  // El propio co-organizador abandona el evento ("Salir del evento").
  async function handleLeaveEvent(uid: string) {
    if (!eventId) return
    await leaveCoOrganizer(eventId, uid)
  }

  async function handleUpdatePermissions(uid: string, permissions: CoOrganizerPermissions) {
    if (!eventId) return
    await updateCoOrganizerPermissions(eventId, uid, permissions)
  }

  return {
    handleRemoveCoOrg,
    handleLeaveEvent,
    handleUpdatePermissions,
  }
}
