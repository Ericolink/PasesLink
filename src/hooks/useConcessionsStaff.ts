import { useState } from 'react'
import { addConcessionsStaff, removeConcessionsStaff } from '../firebase/concessions'
import { getUserByEmail } from '../firebase/userProfile'

// Mismo patrón que useCoOrganizers.ts pero mucho más simple: el Menu Manager
// no tiene permisos granulares, solo un mapa uid → email (ver
// ConcessionsConfig.concessionsStaffMap) — agregar es "resolver el email a
// un uid y sumarlo al mapa", sin editor de permisos ni segundo mapa.
export function useConcessionsStaff(
  eventId: string | undefined,
  ownerId: string | undefined,
  staffMap: Record<string, string> | undefined = {},
) {
  const [staffEmail, setStaffEmail] = useState('')
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState('')

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !staffEmail.trim()) return
    setStaffLoading(true)
    setStaffError('')
    try {
      const found = await getUserByEmail(staffEmail)
      if (!found) {
        setStaffError('Usuario no encontrado. Debe estar registrado en la app.')
        return
      }
      if (found.uid === ownerId) {
        setStaffError('Ese usuario ya es el organizador principal.')
        return
      }
      if (found.uid in staffMap) {
        setStaffError('Ese usuario ya es encargado del menú.')
        return
      }
      await addConcessionsStaff(eventId, found.uid, found.email)
      setStaffEmail('')
    } catch {
      setStaffError('Error al agregar encargado del menú.')
    } finally {
      setStaffLoading(false)
    }
  }

  async function handleRemoveStaff(uid: string) {
    if (!eventId) return
    await removeConcessionsStaff(eventId, uid)
  }

  return { staffEmail, setStaffEmail, staffLoading, staffError, setStaffError, handleAddStaff, handleRemoveStaff }
}
