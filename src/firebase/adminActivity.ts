import { collection, collectionGroup, limit, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'

// Fuentes atómicas del feed "Actividad en tiempo real" del Centro de
// Control — cada una expone listeners chicos (limit 15) ya mapeados al
// mismo shape (AdminActivityEntry), para que fusionarlas en un único feed
// ordenado (ver src/hooks/useRecentActivity.ts) sea solo concat + sort, sin
// lógica de mapeo en el hook. "Evento publicado" no existe como paso —
// EventStatus no tiene draft/publicado (ver EventData en src/types) — y
// "compartió" no está instrumentado; ninguno de los dos aparece acá.
export type AdminActivityKind = 'user_registered' | 'event_created' | 'guest_registered' | 'checkin'

export interface AdminActivityEntry {
  id: string
  kind: AdminActivityKind
  label: string
  subLabel?: string
  timestamp: number
}

export function subscribeToRecentUsers(
  callback: (entries: AdminActivityEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(15))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            kind: 'user_registered' as const,
            label: (data.displayName as string) || (data.email as string) || 'Usuario nuevo',
            timestamp: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('adminActivity.users', onError),
  )
}

export function subscribeToRecentEventsCreated(
  callback: (entries: AdminActivityEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events'), orderBy('createdAt', 'desc'), limit(15))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            kind: 'event_created' as const,
            label: (data.name as string) || 'Evento sin nombre',
            subLabel: (data.location as string) || undefined,
            timestamp: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('adminActivity.eventsCreated', onError),
  )
}

export function subscribeToRecentGuestRegistrations(
  callback: (entries: AdminActivityEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collectionGroup(db, 'guests'), orderBy('createdAt', 'desc'), limit(15))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: `${d.ref.parent.parent?.id}_${d.id}`,
            kind: 'guest_registered' as const,
            label: (data.name as string) || 'Invitado sin nombre',
            timestamp: toMillis(data.createdAt),
          }
        }),
      )
    },
    withListenerReporting('adminActivity.guestRegistrations', onError),
  )
}

export function subscribeToRecentCheckins(
  callback: (entries: AdminActivityEntry[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  // Sin `where`: orderBy('checkedInAt') ya excluye los docs sin ese campo
  // (invitados que nunca hicieron check-in) — no hace falta filtrar aparte.
  const q = query(collectionGroup(db, 'guests'), orderBy('checkedInAt', 'desc'), limit(15))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: `${d.ref.parent.parent?.id}_${d.id}`,
            kind: 'checkin' as const,
            label: (data.name as string) || 'Invitado sin nombre',
            timestamp: toMillis(data.checkedInAt),
          }
        }),
      )
    },
    withListenerReporting('adminActivity.checkins', onError),
  )
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}
