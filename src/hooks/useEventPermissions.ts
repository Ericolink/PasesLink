import { useMemo } from 'react'
import type { User } from 'firebase/auth'
import type { EventData } from '../types'
import { resolveEventPermissions } from '../types/coOrganizerPermissions'

// Único punto donde se resuelve "qué puede hacer este usuario en este
// evento" — todo componente que necesite gatear una acción (agregar
// invitados, escanear, moderar el muro, ver reportes, etc.) usa este hook en
// vez de comparar ownerId/coOrganizersMap a mano.
export function useEventPermissions(
  event: Pick<EventData, 'ownerId' | 'coOrganizersMap' | 'coOrganizerPermissions'> | null | undefined,
  user: Pick<User, 'uid'> | null | undefined,
) {
  return useMemo(() => resolveEventPermissions(event, user?.uid), [event, user?.uid])
}
