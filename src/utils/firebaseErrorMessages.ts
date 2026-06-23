export interface AuthErrorInfo {
  message: string
  actionLabel?: string
  actionTo?: string
}

// Códigos de https://firebase.google.com/docs/reference/js/auth#autherrorcodes.
// `actionTo` solo se incluye cuando hay una página concreta que resuelve el
// problema (registrarse, recuperar contraseña, iniciar sesión) — el resto
// queda como mensaje informativo sin acción clicable.
const AUTH_ERROR_INFO: Record<string, AuthErrorInfo> = {
  'auth/user-not-found': { message: 'Email no existe.', actionLabel: '¿Quieres registrarte?', actionTo: '/register' },
  'auth/wrong-password': { message: 'Contraseña incorrecta.', actionLabel: '¿Olvidaste tu contraseña?', actionTo: '/forgot-password' },
  // Firebase devuelve este código genérico (en vez de user-not-found/wrong-password)
  // desde la protección "enumeration protection" — no se puede saber cuál de
  // las dos falló, así que el mensaje cubre ambos casos.
  'auth/invalid-credential': { message: 'Email o contraseña incorrectos.', actionLabel: '¿Olvidaste tu contraseña?', actionTo: '/forgot-password' },
  'auth/email-already-in-use': { message: 'Este email ya está registrado.', actionLabel: '¿Iniciar sesión?', actionTo: '/login' },
  'auth/weak-password': { message: 'Contraseña muy corta (mín. 6 caracteres).' },
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
