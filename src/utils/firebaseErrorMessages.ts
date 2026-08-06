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

// Sin acoplarse a ninguna clase concreta (FirebaseError, FunctionsError...):
// todos los errores de Firebase exponen `.code`, y es lo único que hace
// falta para elegir el mensaje amigable, sea de Auth o de una Callable
// Function.
function getErrorCode(err: unknown): string | null {
  return (err as { code?: string } | undefined)?.code ?? null
}

export function getAuthErrorInfo(err: unknown, fallbackMessage: string): AuthErrorInfo {
  const code = getErrorCode(err)
  if (code && AUTH_ERROR_INFO[code]) return AUTH_ERROR_INFO[code]
  return { message: fallbackMessage }
}

/** El usuario cerró el popup de Google a propósito — no es un error que mostrar. */
export function isAuthCancellation(err: unknown): boolean {
  const code = getErrorCode(err)
  return !!code && CANCELLATION_CODES.has(code)
}

// Códigos de Callable Functions (https://firebase.google.com/docs/reference/js/functions#functionserrorcode).
// Cuando una llamada nunca llega a ejecutarse en el backend (bloqueo de CSP
// contra *.cloudfunctions.net, sin conexión, timeout), @firebase/functions
// sintetiza el error EN EL CLIENTE con `message === code` (ej.
// `FunctionsError('internal', 'internal')`) — así se ve, sin traducir, un
// simple bloqueo de red, y es lo que terminaba mostrando "Internal" en la
// UI. Los errores que sí llegan a ejecutarse en el backend siempre mandan un
// mensaje distinto del código (ver functions/src/lib/observability/errors.ts,
// que nunca deja escapar un HttpsError sin mensaje amigable), así que esos
// pasan tal cual: ya están en español y pensados para el usuario final.
const FUNCTIONS_ERROR_MESSAGES: Record<string, string> = {
  'functions/internal': 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
  'functions/unknown': 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.',
  'functions/unavailable': 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.',
  'functions/deadline-exceeded': 'La operación tardó demasiado en responder. Intenta de nuevo.',
  'functions/cancelled': 'La operación se canceló. Intenta de nuevo.',
  'functions/unauthenticated': 'Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.',
  'functions/permission-denied': 'No tienes permiso para realizar esta acción.',
  'functions/resource-exhausted': 'Se alcanzó un límite del sistema. Intenta de nuevo en unos minutos.',
}

// Reemplazo directo de `err instanceof Error ? err.message : fallbackMessage`
// en cualquier catch que pueda recibir el error de una Callable Function.
export function getFunctionsErrorMessage(err: unknown, fallbackMessage: string): string {
  const code = getErrorCode(err)
  const message = (err as { message?: string } | undefined)?.message
  if (code?.startsWith('functions/')) {
    const bareCode = code.slice('functions/'.length)
    if (!message || message === bareCode) return FUNCTIONS_ERROR_MESSAGES[code] ?? fallbackMessage
    return message
  }
  if (err instanceof Error && err.message) return err.message
  return fallbackMessage
}
