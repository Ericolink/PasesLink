import { useEffect, useRef, useState } from 'react'
import { collection, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'

export function useCheckinToast(eventId: string | undefined) {
  const [message, setMessage] = useState<string | null>(null)
  const isFirstSnapshot = useRef(true)
  const lastId = useRef<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    const q = query(collection(db, 'events', eventId, 'checkins'), orderBy('timestamp', 'desc'), limit(1))
    return onSnapshot(q, (snapshot) => {
      if (snapshot.empty) return
      const docSnap = snapshot.docs[0]

      if (isFirstSnapshot.current) {
        isFirstSnapshot.current = false
        lastId.current = docSnap.id
        return
      }
      if (docSnap.id === lastId.current) return
      lastId.current = docSnap.id

      const data = docSnap.data()
      const verb = data.type === 'check_out'
        ? (data.exitKind === 'final' ? 'se retiró del evento' : 'salió temporalmente')
        : (data.reentry ? 'reingresó al evento' : 'hizo check-in')
      setMessage(`${data.guestName} ${verb}`)
      setTimeout(() => setMessage(null), 4000)
    })
  }, [eventId])

  return message
}
