import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import type { CheckinLog } from '../types'
import { CheckinSchema, warnIfInvalidShape } from '../types/schemas'

function mapCheckin(id: string, data: Record<string, unknown>): CheckinLog {
  const checkin: CheckinLog = {
    id,
    guestId: data.guestId as string,
    guestName: data.guestName as string,
    type: (data.type as CheckinLog['type']) || 'check_in',
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
  })
}
