import { useState } from 'react'
import { addCoOrganizer, removeCoOrganizer } from '../firebase/events'
import { getUserByEmail } from '../firebase/userProfile'

// Extraído de EventDetail.tsx (Subfase 3.3): agregar/quitar co-organizadores
// por email. `ownerId` se pasa aparte (no como objeto `event` completo) para
// no acoplar este hook a más de lo que realmente necesita.
export function useCoOrganizers(eventId: string | undefined, ownerId: string | undefined) {
  const [coOrgEmail, setCoOrgEmail] = useState('')
  const [coOrgLoading, setCoOrgLoading] = useState(false)
  const [coOrgError, setCoOrgError] = useState('')

  async function handleAddCoOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !coOrgEmail.trim()) return
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
      await addCoOrganizer(eventId, found.uid, found.email)
      setCoOrgEmail('')
    } catch {
      setCoOrgError('Error al agregar co-organizador.')
    } finally {
      setCoOrgLoading(false)
    }
  }

  async function handleRemoveCoOrg(uid: string) {
    if (!eventId) return
    await removeCoOrganizer(eventId, uid)
  }

  return { coOrgEmail, setCoOrgEmail, coOrgLoading, coOrgError, setCoOrgError, handleAddCoOrg, handleRemoveCoOrg }
}
