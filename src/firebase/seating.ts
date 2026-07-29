import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import type { Unsubscribe } from 'firebase/firestore'
import { db } from './config'
import { measureSpan, withListenerReporting } from '../lib/sentry'
import type { SeatingTableData, SeatingTableShape } from '../types'
import { SeatingTableSchema, warnIfInvalidShape } from '../types/schemas'

function mapTable(id: string, data: Record<string, unknown>): SeatingTableData {
  const table: SeatingTableData = {
    id,
    name: (data.name as string) || '',
    capacity: (data.capacity as number) || 0,
    shape: (data.shape as SeatingTableShape) || 'round',
    zone: (data.zone as string) || undefined,
    position: (data.position as { x: number; y: number }) || undefined,
    sortOrder: (data.sortOrder as number) || 0,
    notes: (data.notes as string) || undefined,
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
  }
  warnIfInvalidShape(SeatingTableSchema, 'SeatingTable', table)
  return table
}

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

export interface NewTableInput {
  name: string
  capacity: number
  shape: SeatingTableShape
  zone?: string
  notes?: string
  sortOrder: number
}

export async function createTable(eventId: string, input: NewTableInput) {
  return measureSpan('firestore.createTable', 'db.firestore', async () => {
    const ref = doc(collection(db, 'events', eventId, 'tables'))
    await setDoc(ref, {
      name: input.name,
      capacity: input.capacity,
      shape: input.shape,
      zone: input.zone || '',
      notes: input.notes || '',
      sortOrder: input.sortOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    return ref.id
  })
}

export async function updateTable(
  eventId: string,
  tableId: string,
  input: Partial<NewTableInput>,
) {
  return measureSpan('firestore.updateTable', 'db.firestore', () => updateDoc(
    doc(db, 'events', eventId, 'tables', tableId),
    { ...input, updatedAt: serverTimestamp() },
  ))
}

// No borra ni reasigna invitados que apunten a esta mesa — el llamador (UI)
// debe liberarlos primero (assignGuestToTable a null) y confirmarlo con el
// organizador, para no vaciar mesas en silencio.
export async function deleteTable(eventId: string, tableId: string) {
  return measureSpan('firestore.deleteTable', 'db.firestore', () => deleteDoc(
    doc(db, 'events', eventId, 'tables', tableId),
  ))
}

export function subscribeToTables(
  eventId: string,
  callback: (tables: SeatingTableData[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(collection(db, 'events', eventId, 'tables'), orderBy('sortOrder', 'asc'))
  return onSnapshot(
    q,
    (snap) => callback(snap.docs.map((d) => mapTable(d.id, d.data()))),
    withListenerReporting('seating.tables', onError),
  )
}

// Update angosto (solo `tableId`) — coincide con la rama de firestore.rules
// que permite a un coanfitrión con SOLO manageSeating (sin editGuests) mover
// invitados de mesa. tableId: null libera al invitado (sin mesa asignada).
export async function assignGuestToTable(eventId: string, guestId: string, tableId: string | null) {
  return measureSpan('firestore.assignGuestToTable', 'db.firestore', () => updateDoc(
    doc(db, 'events', eventId, 'guests', guestId),
    { tableId },
  ))
}
