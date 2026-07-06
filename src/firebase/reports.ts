import { collection, getDocs, onSnapshot, orderBy, query, where } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { withListenerReporting } from '../lib/sentry'
import type { CheckinLog } from '../types'
import { CheckinSchema, warnIfInvalidShape } from '../types/schemas'

function mapCheckin(id: string, data: Record<string, unknown>): CheckinLog {
  const checkin: CheckinLog = {
    id,
    guestId: data.guestId as string,
    guestName: data.guestName as string,
    type: (data.type as CheckinLog['type']) || 'check_in',
    exitKind: (data.exitKind as CheckinLog['exitKind']) || undefined,
    reentry: (data.reentry as boolean) || undefined,
    scannedBy: data.scannedBy as string,
    scannedByEmail: (data.scannedByEmail as string) || null,
    timestamp: toMillis(data.timestamp),
  }
  warnIfInvalidShape(CheckinSchema, 'Checkin', checkin)
  return checkin
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

export function subscribeToCheckins(eventId: string, callback: (checkins: CheckinLog[]) => void): Unsubscribe {
  const q = query(collection(db, 'events', eventId, 'checkins'), orderBy('timestamp', 'asc'))
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map((d) => mapCheckin(d.id, d.data())))
  }, withListenerReporting('checkins'))
}

// Historial de accesos de UN invitado (entradas, salidas y reingresos), para
// el panel de administración (GuestList). Consulta puntual (no listener) —
// se pide bajo demanda al expandir el historial de un invitado puntual, no
// hace falta tenerla en vivo como el resto de las estadísticas del dashboard.
export async function getGuestCheckins(eventId: string, guestId: string): Promise<CheckinLog[]> {
  const q = query(
    collection(db, 'events', eventId, 'checkins'),
    where('guestId', '==', guestId),
    orderBy('timestamp', 'asc'),
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map((d) => mapCheckin(d.id, d.data()))
}
