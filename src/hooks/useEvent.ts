import { useEffect, useState } from 'react'
import { subscribeToEvent } from '../firebase/events'
import { subscribeToGuests } from '../firebase/guests'
import type { EventData, GuestData } from '../types'

export function useEvent(eventId: string | undefined) {
  const [event, setEvent] = useState<EventData | null>(null)
  const [guests, setGuests] = useState<GuestData[]>([])
  const [loading, setLoading] = useState(true)
  // Separado de `loading`: el doc del evento y la lista de invitados son dos
  // suscripciones independientes que pueden resolver en momentos distintos —
  // sin esto, una pantalla que solo mira `loading` puede confundir "todavía
  // no llegaron los invitados" con "el evento no tiene invitados".
  const [guestsLoading, setGuestsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    function handleError() {
      setError('No se pudo cargar el evento. Verifica tu conexión o que sigas teniendo acceso.')
      setLoading(false)
      setGuestsLoading(false)
    }
    const unsubEvent = subscribeToEvent(eventId, (data) => {
      setEvent(data)
      setLoading(false)
      setError(null)
    }, handleError)
    const unsubGuests = subscribeToGuests(eventId, (data) => {
      setGuests(data)
      setGuestsLoading(false)
    }, handleError)
    return () => {
      unsubEvent()
      unsubGuests()
    }
  }, [eventId])

  return { event, guests, loading, guestsLoading, error }
}
