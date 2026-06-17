import {
  createUserWithEmailAndPassword,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  sendPasswordResetEmail,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  EmailAuthProvider,
  getAdditionalUserInfo,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider, facebookProvider } from './config'
import { sendWelcomeEmail } from '../utils/emailjs'
import { uploadImage } from '../utils/cloudinary'

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

export async function registerWithEmail(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  birthDate: string,
  photoURL?: string,
) {
  const displayName = `${firstName} ${lastName}`.trim()
  const credential = await createUserWithEmailAndPassword(auth, email, password)
  await updateProfile(credential.user, { displayName, photoURL: photoURL || '' })
  await setDoc(doc(db, 'users', credential.user.uid), {
    email,
    displayName,
    firstName,
    lastName,
    birthDate,
    photoURL: photoURL || null,
    createdAt: serverTimestamp(),
  })
  void sendWelcomeEmail(email, displayName)
  return credential.user
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider)
  await ensureUserDoc(credential.user.uid, credential.user.email, credential.user.displayName)
  if (getAdditionalUserInfo(credential)?.isNewUser && credential.user.email) {
    void sendWelcomeEmail(credential.user.email, credential.user.displayName || '')
  }
  return credential.user
}

export async function loginWithFacebook() {
  const credential = await signInWithPopup(auth, facebookProvider)
  await ensureUserDoc(credential.user.uid, credential.user.email, credential.user.displayName)
  if (getAdditionalUserInfo(credential)?.isNewUser && credential.user.email) {
    void sendWelcomeEmail(credential.user.email, credential.user.displayName || '')
  }
  return credential.user
}

export async function logout() {
  await signOut(auth)
}

export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email, {
    url: `${window.location.origin}/reset-password`,
  })
}

export async function verifyPasswordResetCode(oobCode: string) {
  return firebaseVerifyPasswordResetCode(auth, oobCode)
}

export async function confirmPasswordReset(oobCode: string, newPassword: string) {
  await firebaseConfirmPasswordReset(auth, oobCode, newPassword)
}

export async function updateDisplayName(displayName: string) {
  const user = auth.currentUser
  if (!user) throw new Error('No hay un usuario autenticado.')
  await updateProfile(user, { displayName })
  await setDoc(doc(db, 'users', user.uid), { displayName }, { merge: true })
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('No hay un usuario autenticado.')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export async function uploadProfilePhoto(file: File) {
  const user = auth.currentUser
  if (!user) throw new Error('No hay un usuario autenticado.')
  const photoURL = await uploadImage(file)
  await updateProfile(user, { photoURL })
  await setDoc(doc(db, 'users', user.uid), { photoURL }, { merge: true })
  return photoURL
}

export async function isGoogleProfileComplete(uid: string): Promise<boolean> {
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return false
  const data = snap.data()
  return !!(data.birthDate)
}
