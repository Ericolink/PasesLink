import { doc, arrayRemove, arrayUnion, updateDoc } from 'firebase/firestore'
import { app, db } from './config'
import { cleanEnv } from '../utils/env'
import { captureException } from '../lib/sentry'

// Import dinámico de 'firebase/messaging' (no estático arriba) — mismo
// criterio que 'firebase/app-check' en config.ts: es peso extra de bundle
// que la enorme mayoría de sesiones (invitados, la mayoría de organizadores
// que todavía no activó push) nunca necesita. Se carga recién cuando el
// organizador toca "Activar notificaciones" en Profile.tsx.

const VAPID_KEY = cleanEnv(import.meta.env.VITE_FIREBASE_VAPID_KEY)

function buildServiceWorkerUrl(): string {
  const params = new URLSearchParams({
    apiKey: cleanEnv(import.meta.env.VITE_FIREBASE_API_KEY),
    authDomain: cleanEnv(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
    projectId: cleanEnv(import.meta.env.VITE_FIREBASE_PROJECT_ID),
    storageBucket: cleanEnv(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
    messagingSenderId: cleanEnv(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
    appId: cleanEnv(import.meta.env.VITE_FIREBASE_APP_ID),
  })
  return `/firebase-messaging-sw.js?${params.toString()}`
}

export type PushPermissionResult =
  | { ok: true }
  | { ok: false; error: string }

// Estado del permiso de notificaciones del navegador, sin pedirlo — usado
// por Profile.tsx para mostrar el estado correcto (incompatible/bloqueado)
// antes de que el usuario toque "Activar", ya que Notification.requestPermission()
// no vuelve a mostrar el diálogo si el usuario ya lo bloqueó antes.
export type PushSupportState = 'unsupported' | 'default' | 'denied' | 'granted'

export function getPushPermissionState(): PushSupportState {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return 'unsupported'
  return Notification.permission
}

// Pide permiso de notificaciones, registra el service worker dedicado
// (firebase-messaging-sw.js, separado del que genera vite-plugin-pwa) y
// guarda el token FCM en users/{uid}.fcmTokens — campo simple (no
// subcolección), ya cubierto por la regla existente `allow write: if
// request.auth.uid == userId` sin necesitar cambios en firestore.rules.
// Alcance v1: solo organizadores/coanfitriones (ver plan de la feature) —
// se llama desde Profile.tsx, nunca desde GuestPass.
export async function requestPushPermission(uid: string): Promise<PushPermissionResult> {
  if (!VAPID_KEY) {
    return { ok: false, error: 'Push todavía no está configurado (falta la clave VAPID).' }
  }
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, error: 'Este navegador no soporta notificaciones push.' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return {
        ok: false,
        error: 'Bloqueaste las notificaciones en este navegador. Para activarlas, permite las notificaciones para este sitio desde la configuración de tu navegador e intenta de nuevo.',
      }
    }

    const registration = await navigator.serviceWorker.register(buildServiceWorkerUrl())
    const { getMessaging, getToken } = await import('firebase/messaging')
    const messaging = getMessaging(app)
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration })
    if (!token) {
      return { ok: false, error: 'No se pudo generar el token de notificaciones.' }
    }

    await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayUnion(token) })
    return { ok: true }
  } catch (err) {
    console.error('Error activando push notifications:', err)
    captureException(err, { tags: { flow: 'push.requestPermission' } })
    return { ok: false, error: 'No se pudo activar las notificaciones. Intenta de nuevo.' }
  }
}

// Revoca SOLO el token de este dispositivo (arrayRemove) — no borra
// fcmTokens entero, porque el mismo organizador puede tener push activo en
// otro dispositivo (ej. celular Y notebook) que no debe verse afectado.
export async function disablePushOnThisDevice(uid: string): Promise<void> {
  if (!VAPID_KEY) return
  try {
    const { getMessaging, getToken, deleteToken } = await import('firebase/messaging')
    const messaging = getMessaging(app)
    const registration = await navigator.serviceWorker.getRegistration(buildServiceWorkerUrl())
    const token = await getToken(messaging, { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration }).catch(() => null)
    if (token) {
      await updateDoc(doc(db, 'users', uid), { fcmTokens: arrayRemove(token) })
      await deleteToken(messaging)
    }
  } catch (err) {
    console.error('Error desactivando push notifications:', err)
    captureException(err, { tags: { flow: 'push.disable' } })
  }
}
