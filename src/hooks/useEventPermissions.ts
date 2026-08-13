import { useMemo } from 'react'
import type { User } from 'firebase/auth'
import type { EventData } from '../types'
import { resolveCollaboratorPermissions } from '../types/collaboratorPermissions'

// Único punto donde se resuelve "qué puede hacer este usuario en este
// evento" — todo componente que necesite gatear una acción (agregar
// invitados, escanear, moderar el muro, ver reportes, etc.) usa este hook en
// vez de comparar ownerId/coOrganizersMap a mano. Generalizado (Fase 1 de
// ROLES_PERMISSIONS_REDESIGN.md) para también entender el staff de ventas y
// el futuro mapa unificado `collaborators` — sin cambio de comportamiento
// para los consumidores existentes de coorganizador/dueño.
export function useEventPermissions(
  event:
    | Pick<EventData, 'ownerId' | 'coOrganizersMap' | 'coOrganizerPermissions' | 'collaborators' | 'concessions'>
    | null
    | undefined,
  user: Pick<User, 'uid'> | null | undefined,
) {
  return useMemo(() => resolveCollaboratorPermissions(event, user?.uid), [event, user?.uid])
}
