import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from './config'
import { mapEvent } from './events'
import type { EventData } from '../types'

export interface AdminUser {
  id: string
  email: string | null
  displayName: string | null
  createdAt: number
}

export function subscribeToAllEvents(callback: (events: EventData[]) => void) {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => mapEvent(d.id, d.data())))
  })
}

export function subscribeToAllUsers(callback: (users: AdminUser[]) => void) {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'))
  return onSnapshot(q, (snapshot) => {
    callback(
      snapshot.docs.map((d) => {
        const data = d.data()
        return {
          id: d.id,
          email: (data.email as string) || null,
          displayName: (data.displayName as string) || null,
          createdAt: toMillis(data.createdAt),
        }
      }),
    )
  })
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
