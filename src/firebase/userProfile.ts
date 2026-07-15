import { collection, deleteDoc, doc, getDocs, limit, orderBy, query, setDoc, where, writeBatch } from 'firebase/firestore'
import { db } from './config'
import type { UserProfile, UserInvitation } from '../types'

export async function saveUserProfile(uid: string, data: Partial<Omit<UserProfile, 'uid'>>) {
  await setDoc(doc(db, 'users', uid), data, { merge: true })
}

export async function saveUserInvitation(uid: string, inv: Omit<UserInvitation, 'registeredAt'>) {
  await setDoc(
    doc(db, 'users', uid, 'invitations', inv.eventId),
    { ...inv, registeredAt: Date.now() },
    { merge: true },
  )
}

export async function getUserInvitations(uid: string): Promise<UserInvitation[]> {
  const q = query(
    collection(db, 'users', uid, 'invitations'),
    orderBy('eventDate', 'asc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as UserInvitation)
}

export async function deleteUserInvitation(uid: string, eventId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', uid, 'invitations', eventId))
}

// Versión masiva: MyInvitations.tsx borra todas las invitaciones vencidas de
// una sola vez al abrir la pantalla — antes disparaba un deleteDoc
// independiente por invitación (vía Promise.all), acá es un único batch.
export async function deleteUserInvitations(uid: string, eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return
  const batch = writeBatch(db)
  for (const eventId of eventIds) {
    batch.delete(doc(db, 'users', uid, 'invitations', eventId))
  }
  await batch.commit()
}

export async function getUserByEmail(email: string): Promise<{ uid: string; email: string; displayName: string } | null> {
  const q = query(collection(db, 'users'), where('email', '==', email.trim().toLowerCase()), limit(1))
  const snap = await getDocs(q)
  if (snap.empty) return null
  const d = snap.docs[0]
  const data = d.data()
  return {
    uid: d.id,
    email: data.email as string,
    displayName: (data.displayName as string) || (data.email as string),
  }
}
