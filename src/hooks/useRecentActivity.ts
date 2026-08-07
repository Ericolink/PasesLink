import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToRecentCheckins,
  subscribeToRecentEventsCreated,
  subscribeToRecentGuestRegistrations,
  subscribeToRecentUsers,
  type AdminActivityEntry,
} from '../firebase/adminActivity'

const FEED_LIMIT = 20

// Fusiona las 4 fuentes atómicas de adminActivity.ts en un único feed
// ordenado por fecha — cada fuente ya trae sus propios 15 más recientes, acá
// solo se concatena/ordena/recorta, sin mapeo (ese ya lo hizo cada
// subscribeToXxx, ver adminActivity.ts).
export function useRecentActivity() {
  const [users, setUsers] = useState<AdminActivityEntry[]>([])
  const [eventsCreated, setEventsCreated] = useState<AdminActivityEntry[]>([])
  const [guestRegistrations, setGuestRegistrations] = useState<AdminActivityEntry[]>([])
  const [checkins, setCheckins] = useState<AdminActivityEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let pending = 4
    const onLoaded = () => {
      pending -= 1
      if (pending === 0) setLoading(false)
    }
    const unsubUsers = subscribeToRecentUsers((entries) => {
      setUsers(entries)
      onLoaded()
    }, (err) => console.error('Error en actividad de usuarios:', err))
    const unsubEvents = subscribeToRecentEventsCreated((entries) => {
      setEventsCreated(entries)
      onLoaded()
    }, (err) => console.error('Error en actividad de eventos:', err))
    const unsubGuests = subscribeToRecentGuestRegistrations((entries) => {
      setGuestRegistrations(entries)
      onLoaded()
    }, (err) => console.error('Error en actividad de invitados:', err))
    const unsubCheckins = subscribeToRecentCheckins((entries) => {
      setCheckins(entries)
      onLoaded()
    }, (err) => console.error('Error en actividad de check-ins:', err))
    return () => {
      unsubUsers()
      unsubEvents()
      unsubGuests()
      unsubCheckins()
    }
  }, [])

  const entries = useMemo(
    () =>
      [...users, ...eventsCreated, ...guestRegistrations, ...checkins]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, FEED_LIMIT),
    [users, eventsCreated, guestRegistrations, checkins],
  )

  return { entries, loading }
}
