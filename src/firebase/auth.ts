import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './config'

async function ensureUserDoc(uid: string, email: string | null, displayName: string | null) {
  await setDoc(
    doc(db, 'users', uid),
    {
      email,
      displayName,
      createdAt: serverTimestamp(),
    },
    { merge: true },
  )
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  if (displayName) {
    await updateProfile(credential.user, { displayName })
  }
  await ensureUserDoc(credential.user.uid, credential.user.email, displayName || null)
  return credential.user
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider)
  await ensureUserDoc(credential.user.uid, credential.user.email, credential.user.displayName)
  return credential.user
}

export async function logout() {
  await signOut(auth)
}
