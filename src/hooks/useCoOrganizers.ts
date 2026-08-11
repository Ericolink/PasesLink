import { useState } from 'react'
import { leaveCoOrganizer, removeCoOrganizer, updateCoOrganizerPermissions } from '../firebase/events'
import { buildCoOrganizerInviteUrl, createCoOrganizerInvite } from '../firebase/coOrganizerInvites'
import type { CoOrganizerPermissions } from '../types/coOrganizerPermissions'
import { EVENT_CO_ORGANIZERS_MAX } from '../utils/validation'
import { useAnnouncer } from '../components/accessibility/LiveRegion'

export interface GeneratedCoOrganizerInvite {
  url: string
  expiresAt: number
}

// Extraído de EventDetail.tsx (Subfase 3.3): agregar/quitar co-organizadores.
// `coOrgsMap` (uid -> email) se pasa aparte del objeto `event` completo
// porque solo hace falta para el tope de EVENT_CO_ORGANIZERS_MAX antes de
// generar un enlace. Única vía de alta: enlace/QR (rediseño del Dashboard
// del Evento) — se quitó el alta directa por correo, que exigía que el
// organizador supiera de antemano el correo exacto de alguien que ya tuviera
// cuenta.
export function useCoOrganizers(
  eventId: string | undefined,
  coOrgsMap: Record<string, string> | undefined = {},
) {
  const [invite, setInvite] = useState<GeneratedCoOrganizerInvite | null>(null)
  const [inviteLoading, setInviteLoading] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const { announce } = useAnnouncer()

  async function handleGenerateInvite() {
    if (!eventId) return
    if (Object.keys(coOrgsMap).length >= EVENT_CO_ORGANIZERS_MAX) {
      setInviteError(`Este evento ya alcanzó el máximo de ${EVENT_CO_ORGANIZERS_MAX} co-organizadores.`)
      return
    }
    setInviteLoading(true)
    setInviteError('')
    try {
      const result = await createCoOrganizerInvite(eventId)
      if (result.status === 'full') {
        setInviteError(`Este evento ya alcanzó el máximo de ${EVENT_CO_ORGANIZERS_MAX} co-organizadores.`)
        return
      }
      setInvite({ url: buildCoOrganizerInviteUrl(eventId, result.token), expiresAt: result.expiresAt })
      announce('Enlace de invitación generado')
    } catch {
      setInviteError('No se pudo generar el enlace de invitación. Intenta de nuevo.')
    } finally {
      setInviteLoading(false)
    }
  }

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
    invite,
    inviteLoading,
    inviteError,
    handleGenerateInvite,
  }
}
