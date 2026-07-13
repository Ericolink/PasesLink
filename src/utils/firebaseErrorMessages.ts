import { PASSWORD_MIN_LENGTH } from './validationRules'

export interface AuthErrorInfo {
  message: string
  actionLabel?: string
  actionTo?: string
}

// Códigos de https://firebase.google.com/docs/reference/js/auth#autherrorcodes.
// `actionTo` solo se incluye cuando hay una página concreta que resuelve el
// problema (registrarse, recuperar contraseña, iniciar sesión) — el resto
// queda como mensaje informativo sin acción clicable.
// Mismo mensaje para las 3 — deliberado (evita enumeración de usuarios).
// Firebase puede devolver 'auth/user-not-found' o 'auth/wrong-password' por
// separado (según esté configurada la protección "enumeration protection"
// del proyecto en la consola), o el genérico 'auth/invalid-credential' si
// esa protección está activa. Antes 'user-not-found' mostraba "Email no
// existe" + un CTA a /register — eso por sí solo confirmaba a un atacante
// qué emails están registrados, sin importar la config de la consola. Con
// el mismo mensaje/CTA para los 3 códigos, esta pantalla no filtra esa
// información pase lo que pase del lado de la consola.
const INVALID_CREDENTIAL_INFO: AuthErrorInfo = {
  message: 'Email o contraseña incorrectos.',
  actionLabel: '¿Olvidaste tu contraseña?',
  actionTo: '/forgot-password',
}

const AUTH_ERROR_INFO: Record<string, AuthErrorInfo> = {
  'auth/user-not-found': INVALID_CREDENTIAL_INFO,
  'auth/wrong-password': INVALID_CREDENTIAL_INFO,
  'auth/invalid-credential': INVALID_CREDENTIAL_INFO,
  'auth/email-already-in-use': { message: 'Este email ya está registrado.', actionLabel: '¿Iniciar sesión?', actionTo: '/login' },
  'auth/weak-password': { message: `Contraseña muy corta (mín. ${PASSWORD_MIN_LENGTH} caracteres).` },
  'auth/network-request-failed': { message: 'Sin conexión. Intenta en unos segundos.' },
  'auth/invalid-email': { message: 'El email no tiene un formato válido.' },
  'auth/too-many-requests': { message: 'Demasiados intentos. Espera unos minutos e intenta de nuevo.' },
  'auth/user-disabled': { message: 'Esta cuenta fue deshabilitada. Contacta a soporte.' },
  'auth/expired-action-code': { message: 'El enlace expiró. Solicita uno nuevo.' },
  'auth/invalid-action-code': { message: 'El enlace no es válido o ya fue usado.' },
  'auth/requires-recent-login': { message: 'Por seguridad, vuelve a iniciar sesión para continuar.' },
}

const CANCELLATION_CODES = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
])

function getAuthErrorCode(err: unknown): string | null {
  return (err as { code?: string } | undefined)?.code ?? null
}

export function getAuthErrorInfo(err: unknown, fallbackMessage: string): AuthErrorInfo {
  const code = getAuthErrorCode(err)
  if (code && AUTH_ERROR_INFO[code]) return AUTH_ERROR_INFO[code]
  return { message: fallbackMessage }
}

/** El usuario cerró el popup de Google a propósito — no es un error que mostrar. */
export function isAuthCancellation(err: unknown): boolean {
  const code = getAuthErrorCode(err)
  return !!code && CANCELLATION_CODES.has(code)
}
