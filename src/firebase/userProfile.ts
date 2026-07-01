import { collection, deleteDoc, doc, getDoc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore'
import { db } from './config'
import type { UserProfile, UserInvitation } from '../types'

function toMillis(value: unknown): number {
  if (value && typeof value === 'object' && 'toMillis' in value) {
    return (value as { toMillis: () => number }).toMillis()
  }
  return 0
}

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

// Inverso de getUserByEmail: lee el perfil completo por uid. Lo necesita
// sendCheckinSummary (guests.ts) para leer notifyOnCheckin + el email del
// organizador a partir de organizerUid, no de su email.
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    uid,
    email: (data.email as string) || '',
    firstName: (data.firstName as string) || '',
    lastName: (data.lastName as string) || '',
    displayName: (data.displayName as string) || '',
    birthDate: (data.birthDate as string) || '',
    photoURL: data.photoURL as string | undefined,
    notifyOnCheckin: (data.notifyOnCheckin as boolean) || false,
    createdAt: toMillis(data.createdAt),
  }
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
