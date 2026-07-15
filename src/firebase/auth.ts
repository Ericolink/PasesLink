import {
  createUserWithEmailAndPassword,
  confirmPasswordReset as firebaseConfirmPasswordReset,
  sendEmailVerification,
  sendPasswordResetEmail,
  verifyPasswordResetCode as firebaseVerifyPasswordResetCode,
  EmailAuthProvider,
  getAdditionalUserInfo,
  linkWithCredential,
  linkWithPopup,
  reauthenticateWithCredential,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, googleProvider } from './config'
import { sendWelcomeEmail } from '../utils/emailjs'
import { uploadImage } from '../utils/cloudinary'
import { markWelcomePending } from '../utils/onboarding'

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
    photoURL: photoURL || null,
    createdAt: serverTimestamp(),
  })
  await sendEmailVerification(credential.user)
  void sendWelcomeEmail(email, displayName)
  markWelcomePending(credential.user.uid)
  return credential.user
}

/** Reenvía el email de verificación al usuario autenticado actual. */
export async function resendVerificationEmail() {
  const user = auth.currentUser
  if (!user) throw new Error('No hay un usuario autenticado.')
  await sendEmailVerification(user)
}

/** Recarga al usuario actual desde Firebase y devuelve si ya verificó su email. */
export async function checkEmailVerified(): Promise<boolean> {
  const user = auth.currentUser
  if (!user) return false
  await user.reload()
  return user.emailVerified
}

export async function loginWithEmail(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email, password)
  return credential.user
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider)
  await ensureUserDoc(credential.user.uid, credential.user.email, credential.user.displayName)
  if (getAdditionalUserInfo(credential)?.isNewUser) {
    markWelcomePending(credential.user.uid)
    if (credential.user.email) void sendWelcomeEmail(credential.user.email, credential.user.displayName || '')
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

export async function changePassword(currentPassword: string, newPassword: string) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('No hay un usuario autenticado.')
  const credential = EmailAuthProvider.credential(user.email, currentPassword)
  await reauthenticateWithCredential(user, credential)
  await updatePassword(user, newPassword)
}

export async function uploadProfilePhoto(file: File | Blob) {
  const user = auth.currentUser
  if (!user) throw new Error('No hay un usuario autenticado.')
  const photoURL = await uploadImage(file)
  await updateProfile(user, { photoURL })
  await setDoc(doc(db, 'users', user.uid), { photoURL }, { merge: true })
  return photoURL
}

export async function linkGoogleAccount() {
  const user = auth.currentUser
  if (!user) throw new Error('No hay usuario autenticado')
  await linkWithPopup(user, googleProvider)
  await user.reload()
}

export async function linkEmailPassword(password: string) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('No hay usuario autenticado')
  const credential = EmailAuthProvider.credential(user.email, password)
  await linkWithCredential(user, credential)
  await user.reload()
}

export async function unlinkProvider(providerId: string) {
  const user = auth.currentUser
  if (!user) throw new Error('No hay usuario autenticado')
  await unlink(user, providerId)
  await user.reload()
}

export async function isGoogleProfileComplete(uid: string): Promise<boolean> {
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return false
  const data = snap.data()
  return !!(data.firstName)
}
