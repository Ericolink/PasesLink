import { useEffect, useState } from 'react'
import { subscribeToGuests } from '../firebase/guests'
import { useEventOnly } from './useEventOnly'
import type { GuestData } from '../types'

// Compone useEventOnly (suscripción al doc del evento) y le agrega la
// suscripción a `guests` encima — evita mantener dos copias del mismo bloque
// de suscripción al evento (antes useEvent reimplementaba el de
// useEventOnly de forma casi idéntica, así que un fix a uno no llegaba al otro).
export function useEvent(eventId: string | undefined) {
  const { event, loading, error: eventError } = useEventOnly(eventId)
  const [guests, setGuests] = useState<GuestData[]>([])
  // Separado de `loading`: el doc del evento y la lista de invitados son dos
  // suscripciones independientes que pueden resolver en momentos distintos —
  // sin esto, una pantalla que solo mira `loading` puede confundir "todavía
  // no llegaron los invitados" con "el evento no tiene invitados".
  const [guestsLoading, setGuestsLoading] = useState(true)
  const [guestsError, setGuestsError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    const unsubGuests = subscribeToGuests(
      eventId,
      (data) => {
        setGuests(data)
        setGuestsLoading(false)
      },
      () => {
        setGuestsError('No se pudo cargar el evento. Verifica tu conexión o que sigas teniendo acceso.')
        setGuestsLoading(false)
      },
    )
    return unsubGuests
  }, [eventId])

  return { event, guests, loading, guestsLoading, error: eventError || guestsError }
}
