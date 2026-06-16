import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './config'

/** Opción A / C — Incrementa checkedInCount atómicamente. Respeta el cupo si está definido. */
export async function walkIn(eventId: string): Promise<'success' | 'full'> {
  const eventRef = doc(db, 'events', eventId)
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return 'full'
    const data = snap.data()
    const capacity = data.capacity as number | null
    const current = (data.checkedInCount as number) || 0
    if (capacity && current >= capacity) return 'full'
    tx.update(eventRef, { checkedInCount: increment(1) })
    return 'success'
  })
}

/** Opción A — Decrementa checkedInCount (libera un lugar). */
export async function walkOut(eventId: string): Promise<void> {
  const eventRef = doc(db, 'events', eventId)
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return
    const current = (snap.data().checkedInCount as number) || 0
    if (current <= 0) return
    tx.update(eventRef, { checkedInCount: increment(-1) })
  })
}

/** Opción B — Crea un invitado al instante (auto-registro público). Respeta el cupo. */
export async function registerWalkInGuest(
  eventId: string,
  name: string,
  email?: string,
): Promise<{ status: 'success' | 'full'; qrToken?: string }> {
  const eventRef = doc(db, 'events', eventId)

  return runTransaction(db, async (tx) => {
    const snap = await tx.get(eventRef)
    if (!snap.exists()) return { status: 'full' }
    const data = snap.data()
    const capacity = data.capacity as number | null
    const guestCount = (data.guestCount as number) || 0
    if (capacity && guestCount >= capacity) return { status: 'full' }

    const qrToken = crypto.randomUUID().replace(/-/g, '')
    const guestRef = doc(collection(db, 'events', eventId, 'guests'))
    tx.set(guestRef, {
      name: name.trim(),
      email: email?.trim() || '',
      phone: '',
      qrToken,
      status: 'invited',
      rsvpStatus: 'yes',
      companions: 0,
      checkedInAt: null,
      checkedInBy: null,
      checkedInByEmail: null,
      checkedOutAt: null,
      checkedOutByEmail: null,
      lockToken: null,
      notes: '',
      createdAt: serverTimestamp(),
    })
    tx.update(eventRef, { guestCount: increment(1) })

    return { status: 'success', qrToken }
  })
}
