import { useEffect, useState } from 'react'
import { subscribeToEvent } from '../firebase/events'
import type { EventData } from '../types'

// Para pantallas que solo necesitan los datos/contadores del evento (p.ej.
// Scanner) y no la lista de invitados. A diferencia de useEvent, no suscribe
// `guests`/`guestContacts` — evita lecturas, memoria y renders innecesarios
// en pantallas de alto tráfico (muchos dispositivos a la vez).
export function useEventOnly(eventId: string | undefined) {
  const [event, setEvent] = useState<EventData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    function handleError() {
      setError('No se pudo cargar el evento. Verifica tu conexión o que sigas teniendo acceso.')
      setLoading(false)
    }
    const unsubscribe = subscribeToEvent(eventId, (data) => {
      setEvent(data)
      setLoading(false)
      setError(null)
    }, handleError)
    return unsubscribe
  }, [eventId])

  return { event, loading, error }
}
