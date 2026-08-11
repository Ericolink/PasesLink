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
  reauthenticateWithPopup,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  unlink,
  updatePassword,
  updateProfile,
} from 'firebase/auth'
import { doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions, googleProvider } from './config'
import { uploadImage } from '../utils/cloudinary'
import { clearWelcomeState, markWelcomePending } from '../utils/onboarding'
import { trackLogin, trackLogout } from '../lib/analytics'
import { recordDeviceSession } from './deviceStats'

// Contador de "Dispositivos" del Centro de Control admin (ver
// src/firebase/deviceStats.ts) — a lo sumo una vez por pestaña/sesión de
// navegador (no por login: un usuario puede cerrar y volver a entrar varias
// veces sin inflar el conteo). Nunca debe poder romper un login real, así
// que va envuelto en try/catch silencioso — un fallo acá es, en el peor
// caso, un dato de analítica interna perdido.
const DEVICE_SESSION_GUARD_KEY = 'pl_device_tracked'

function trackDeviceSessionOnce() {
  if (sessionStorage.getItem(DEVICE_SESSION_GUARD_KEY)) return
  sessionStorage.setItem(DEVICE_SESSION_GUARD_KEY, '1')
  recordDeviceSession(navigator.userAgent).catch(() => {})
}

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
  // El correo de bienvenida ya no se dispara desde acá — la creación de
  // este documento es lo que dispara el trigger de Firestore onUserCreated
  // (functions/src/triggers/onUserCreated.ts), ver
  // NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 4.
  await setDoc(doc(db, 'users', credential.user.uid), {
    email,
    displayName,
    firstName,
    lastName,
    photoURL: photoURL || null,
    createdAt: serverTimestamp(),
  })
  await sendEmailVerification(credential.user)
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
  trackLogin('password')
  trackDeviceSessionOnce()
  return credential.user
}

export async function loginWithGoogle() {
  const credential = await signInWithPopup(auth, googleProvider)
  // ensureUserDoc usa merge:true — en un usuario que ya existía esto es un
  // update y no dispara onUserCreated (Fase 4), reproduciendo el mismo gate
  // de "solo la primera vez" que antes hacía isNewUser acá a mano para el
  // correo de bienvenida.
  await ensureUserDoc(credential.user.uid, credential.user.email, credential.user.displayName)
  if (getAdditionalUserInfo(credential)?.isNewUser) {
    markWelcomePending(credential.user.uid)
  }
  trackLogin('google')
  trackDeviceSessionOnce()
  return credential.user
}

export async function logout() {
  await signOut(auth)
  trackLogout()
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

/**
 * Reautenticación reciente exigida por la Cloud Function `deleteAccount`
 * (ver functions/src/callable/deleteAccount.ts) antes de borrar la cuenta.
 * Solo cubre los dos providers habilitados en este proyecto (password,
 * google.com) — mismo criterio que el resto de auth.ts.
 */
export async function reauthenticateWithPassword(password: string) {
  const user = auth.currentUser
  if (!user || !user.email) throw new Error('No hay un usuario autenticado.')
  const credential = EmailAuthProvider.credential(user.email, password)
  await reauthenticateWithCredential(user, credential)
}

export async function reauthenticateWithGoogle() {
  const user = auth.currentUser
  if (!user) throw new Error('No hay usuario autenticado')
  await reauthenticateWithPopup(user, googleProvider)
}

// Punto de entrada único de "Eliminar mi cuenta" (ver Profile.tsx). La
// Cloud Function hace TODO el trabajo destructivo (Firestore + Firebase
// Auth) con Admin SDK — acá solo se limpia lo que vive exclusivamente en
// este navegador y se cierra la sesión, para que la UI no siga mostrando
// datos de una cuenta que ya no existe.
export async function deleteAccount(): Promise<void> {
  const user = auth.currentUser
  if (!user) throw new Error('No hay un usuario autenticado.')
  const uid = user.uid
  const deleteAccountCallable = httpsCallable<void, { ok: true }>(functions, 'deleteAccount')
  await deleteAccountCallable()
  clearWelcomeState(uid)
  await signOut(auth)
}

export async function isGoogleProfileComplete(uid: string): Promise<boolean> {
  const { getDoc } = await import('firebase/firestore')
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return false
  const data = snap.data()
  return !!(data.firstName)
}
