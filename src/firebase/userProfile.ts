import { collection, doc, getDocs, limit, orderBy, query, setDoc, where } from 'firebase/firestore'
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
    orderBy('registeredAt', 'desc'),
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => d.data() as UserInvitation)
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
