import { useEffect, useState } from 'react'
import { subscribeToEvent } from '../firebase/events'
import { subscribeToGuests } from '../firebase/guests'
import type { EventData, GuestData } from '../types'

export function useEvent(eventId: string | undefined) {
  const [event, setEvent] = useState<EventData | null>(null)
  const [guests, setGuests] = useState<GuestData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!eventId) return
    const unsubEvent = subscribeToEvent(eventId, (data) => {
      setEvent(data)
      setLoading(false)
    })
    const unsubGuests = subscribeToGuests(eventId, setGuests)
    return () => {
      unsubEvent()
      unsubGuests()
    }
  }, [eventId])

  return { event, guests, loading }
}
