import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  doc,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'
import { registerWalkInGuest } from './capacity'
import type { WaitlistEntry } from '../types'

export async function addToWaitlist(
  eventId: string,
  name: string,
  lastName: string,
  phone: string,
): Promise<void> {
  await addDoc(collection(db, 'events', eventId, 'waitlist'), {
    name: name.trim(),
    lastName: lastName.trim(),
    phone: phone.trim(),
    status: 'waiting',
    qrToken: null,
    createdAt: serverTimestamp(),
  })
}

export function subscribeToWaitlist(
  eventId: string,
  callback: (entries: WaitlistEntry[]) => void,
) {
  const q = query(
    collection(db, 'events', eventId, 'waitlist'),
    orderBy('createdAt', 'asc'),
  )
  return onSnapshot(q, (snap) => {
    callback(
      snap.docs.map((d) => ({
        id: d.id,
        name: d.data().name as string,
        lastName: d.data().lastName as string,
        phone: d.data().phone as string,
        status: d.data().status as WaitlistEntry['status'],
        qrToken: d.data().qrToken as string | undefined,
        createdAt:
          d.data().createdAt && typeof d.data().createdAt.toMillis === 'function'
            ? d.data().createdAt.toMillis()
            : 0,
      })),
    )
  })
}

export async function promoteFromWaitlist(
  eventId: string,
  entryId: string,
  name: string,
  lastName: string,
  phone: string,
): Promise<string | null> {
  const fullName = `${name.trim()} ${lastName.trim()}`
  const result = await registerWalkInGuest(eventId, fullName, undefined, phone)
  if (result.status !== 'success' || !result.qrToken) return null

  await updateDoc(doc(db, 'events', eventId, 'waitlist', entryId), {
    status: 'promoted',
    qrToken: result.qrToken,
  })
  return result.qrToken
}
