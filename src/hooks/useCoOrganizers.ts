import { useState } from 'react'
import { addCoOrganizer, leaveCoOrganizer, removeCoOrganizer, updateCoOrganizerPermissions } from '../firebase/events'
import { getUserByEmail } from '../firebase/userProfile'
import type { CoOrganizerPermissions } from '../types/coOrganizerPermissions'
import { EVENT_CO_ORGANIZERS_MAX } from '../utils/validation'

// Extraído de EventDetail.tsx (Subfase 3.3): agregar/quitar co-organizadores
// por email. `ownerId` se pasa aparte (no como objeto `event` completo) para
// no acoplar este hook a más de lo que realmente necesita. `coOrgsMap`
// (uid -> email) se pasa por el mismo motivo: solo hace falta para detectar
// duplicados antes de escribir.
export function useCoOrganizers(
  eventId: string | undefined,
  ownerId: string | undefined,
  coOrgsMap: Record<string, string> | undefined = {},
) {
  const [coOrgEmail, setCoOrgEmail] = useState('')
  const [coOrgLoading, setCoOrgLoading] = useState(false)
  const [coOrgError, setCoOrgError] = useState('')

  async function handleAddCoOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !coOrgEmail.trim()) return
    if (Object.keys(coOrgsMap).length >= EVENT_CO_ORGANIZERS_MAX) {
      setCoOrgError(`Este evento ya alcanzó el máximo de ${EVENT_CO_ORGANIZERS_MAX} co-organizadores.`)
      return
    }
    setCoOrgLoading(true)
    setCoOrgError('')
    try {
      const found = await getUserByEmail(coOrgEmail)
      if (!found) {
        setCoOrgError('Usuario no encontrado. Debe estar registrado en la app.')
        return
      }
      if (found.uid === ownerId) {
        setCoOrgError('Ese usuario ya es el organizador principal.')
        return
      }
      // Sin este chequeo, re-agregar a alguien que ya es co-organizador
      // llamaba a addCoOrganizer de nuevo y pisaba en silencio sus permisos
      // ya personalizados con los defaults amplios de LEGACY_COORG_DEFAULTS.
      if (found.uid in coOrgsMap) {
        setCoOrgError('Ese usuario ya es co-organizador de este evento.')
        return
      }
      await addCoOrganizer(eventId, found.uid, found.email)
      setCoOrgEmail('')
    } catch {
      setCoOrgError('Error al agregar co-organizador.')
    } finally {
      setCoOrgLoading(false)
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
    coOrgEmail,
    setCoOrgEmail,
    coOrgLoading,
    coOrgError,
    setCoOrgError,
    handleAddCoOrg,
    handleRemoveCoOrg,
    handleLeaveEvent,
    handleUpdatePermissions,
  }
}
