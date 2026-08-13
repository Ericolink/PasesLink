import { useState } from 'react'
import { leaveCollaborator, removeCollaborator } from '../firebase/events'
import { buildCollaboratorInviteUrl, createCollaboratorInvite } from '../firebase/collaboratorInvites'
import type { CollaboratorRole } from '../types/collaboratorPermissions'
import { EVENT_COLLABORATORS_MAX } from '../utils/validation'
import { useAnnouncer } from '../components/accessibility/LiveRegion'

export interface GeneratedCollaboratorInvite {
  url: string
  role: CollaboratorRole
  expiresAt: number
}

// Sistema unificado de colaboradores (ROLES_PERMISSIONS_REDESIGN.md Fase 4)
// — reemplazo de useCoOrganizers.ts para altas nuevas: el anfitrión elige un
// ROL (no un conjunto de permisos sueltos) y genera un enlace/QR de un solo
// uso, mismo patrón que coorganizadores/encargados de ventas.
export function useCollaborators(
  eventId: string | undefined,
  collaboratorsMap: Record<string, unknown> | undefined = {},
) {
  const [invite, setInvite] = useState<GeneratedCollaboratorInvite | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const { announce } = useAnnouncer()

  async function handleGenerateInvite(role: CollaboratorRole) {
    if (!eventId) return
    if (Object.keys(collaboratorsMap).length >= EVENT_COLLABORATORS_MAX) {
      setInviteError(`Este evento ya alcanzó el máximo de ${EVENT_COLLABORATORS_MAX} colaboradores.`)
      return
    }
    setInviteLoading(true)
    setInviteError('')
    try {
      const result = await createCollaboratorInvite(eventId, role)
      if (result.status === 'full') {
        setInviteError(`Este evento ya alcanzó el máximo de ${EVENT_COLLABORATORS_MAX} colaboradores.`)
        return
      }
      setInvite({ url: buildCollaboratorInviteUrl(eventId, result.token, role), role, expiresAt: result.expiresAt })
      announce('Enlace de invitación generado')
    } catch {
      setInviteError('No se pudo generar el enlace de invitación. Intenta de nuevo.')
    } finally {
      setInviteLoading(false)
    }
  }

  async function handleRemoveCollaborator(uid: string) {
    if (!eventId) return
    await removeCollaborator(eventId, uid)
  }

  async function handleLeaveEvent(uid: string) {
    if (!eventId) return
    await leaveCollaborator(eventId, uid)
  }

  return {
    handleRemoveCollaborator,
    handleLeaveEvent,
    invite,
    inviteLoading,
    inviteError,
    handleGenerateInvite,
  }
}
