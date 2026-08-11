import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { deleteEvent } from '../firebase/events'
import { trackEventDelete } from '../lib/analytics'

// Extraído de EventDetail.tsx (auditoría de escalabilidad, hallazgo F13):
// eliminar el evento — solo lo usa el dueño (ver el gate perms.isOwner en
// EventManagementPanel). Sin acciones de cambio de estado (ver
// EventManagementPanel.tsx: el panel se redujo a solo "Zona peligrosa").
// `actionError` es propio de este hook, no el mismo que usa el flujo
// separado de "salir del evento" (handleLeave, sigue en EventDetail.tsx):
// antes compartían una sola variable, pero nunca se muestran juntos (son
// mutuamente excluyentes — isOwner vs. isCoOrg && !isOwner) así que
// separarlos no cambia nada visible y evita que este hook dependa de un
// estado que no le pertenece.
export function useEventLifecycleActions(eventId: string | undefined) {
  const navigate = useNavigate()
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState('')

  async function handleDelete() {
    if (!eventId) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteEvent(eventId)
      trackEventDelete(eventId)
      navigate('/dashboard')
    } catch {
      setConfirmDelete(false)
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  return {
    deleting,
    confirmDelete,
    actionError,
    setConfirmDelete,
    handleDelete,
  }
}
