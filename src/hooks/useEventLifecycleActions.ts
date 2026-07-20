import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteEvent, setEventStatus } from '../firebase/events'
import type { EventStatus } from '../types'

// Extraído de EventDetail.tsx (auditoría de escalabilidad, hallazgo F13):
// cambiar estado (cancelar/reactivar) y eliminar el evento — solo lo usa el
// dueño (ver el gate perms.isOwner en EventManagementPanel). `actionError` es
// propio de este hook, no el mismo que usa el flujo separado de "salir del
// evento" (handleLeave, sigue en EventDetail.tsx): antes compartían una sola
// variable, pero nunca se muestran juntos (son mutuamente excluyentes —
// isOwner vs. isCoOrg && !isOwner) así que separarlos no cambia nada visible
// y evita que este hook dependa de un estado que no le pertenece.
export function useEventLifecycleActions(eventId: string | undefined) {
  const navigate = useNavigate()
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmCancelEvent, setConfirmCancelEvent] = useState(false)
  const [actionError, setActionError] = useState('')

  async function handleStatusChange(status: EventStatus) {
    if (!eventId) return
    setUpdatingStatus(true)
    setActionError('')
    try {
      await setEventStatus(eventId, status)
    } catch {
      setActionError('No se pudo actualizar el estado del evento. Intenta de nuevo.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleDelete() {
    if (!eventId) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteEvent(eventId)
      navigate('/dashboard')
    } catch {
      setConfirmDelete(false)
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  return {
    updatingStatus,
    deleting,
    confirmDelete,
    confirmCancelEvent,
    actionError,
    setConfirmDelete,
    setConfirmCancelEvent,
    handleStatusChange,
    handleDelete,
  }
}
