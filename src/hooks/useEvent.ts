import { useCallback, useEffect, useState } from 'react'
import { GUEST_WINDOW_DEFAULT, subscribeToGuests } from '../firebase/guests'
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
  // Fase 6: la suscripción arranca acotada a GUEST_WINDOW_DEFAULT (ver
  // subscribeToGuests) — showAllGuests() la reabre sin límite. Es un
  // interruptor de una sola dirección (no vuelve a acotarse) para no andar
  // resuscribiendo la query de un lado a otro; se resetea solo al cambiar de
  // evento (remount completo vía key={eventId} en App.tsx).
  const [unbounded, setUnbounded] = useState(false)

  useEffect(() => {
    if (!eventId) return
    // No resetea guestsLoading a `true` al pasar de acotado a sin límite
    // (showAllGuests): guestsTruncated ya cubre ese estado intermedio para
    // quien consuma este hook (ver EventDetail.tsx/Reports.tsx), y
    // guestsLoading solo hace falta reflejar la primera carga real.
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
      unbounded ? null : GUEST_WINDOW_DEFAULT,
    )
    return unsubGuests
  }, [eventId, unbounded])

  const showAllGuests = useCallback(() => setUnbounded(true), [])
  // true mientras la ventana acotada todavía no cubre todos los invitados
  // del evento (event.guestCount, contador desnormalizado siempre exacto) —
  // false una vez que showAllGuests() está activo, aunque la carga completa
  // todavía esté en camino (evita un falso "truncado" parpadeando mientras
  // la nueva suscripción sin límite entrega su primer snapshot).
  const guestsTruncated = !unbounded && !!event && guests.length < event.guestCount

  // `error` (del doc del evento) y `guestsError` (de la subcolección) se
  // devuelven separados a propósito — antes se fusionaban en un solo
  // `error`, así que un coanfitrión sin permiso `viewGuestList` (a quien
  // rules le rechaza la suscripción a `guests`) tumbaba la página ENTERA en
  // vez de perder solo la sección de invitados. Cada consumidor decide qué
  // hacer con `guestsError` (ver EventDetail.tsx: oculta la card de
  // invitados si falta el permiso, en vez de reemplazar toda la pantalla).
  return { event, guests, loading, guestsLoading, error: eventError, guestsError, guestsTruncated, showAllGuests }
}
