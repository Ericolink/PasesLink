// Bienvenida (cuentas nuevas) y novedades (cuentas ya registradas). Todo
// client-side vía localStorage por uid — sin Cloud Functions ni campos
// nuevos en Firestore, mismo criterio que useTheme/useFormDraft en este
// proyecto. localStorage es por navegador: el mismo usuario en otro
// dispositivo puede volver a ver el aviso una vez — aceptable para un
// mensaje informativo que no repite nada crítico.

const WELCOME_PENDING_PREFIX = 'paselink_welcome_pending_'
const NOVEDADES_SEEN_PREFIX = 'paselink_novedades_seen_'

// Subir este valor cuando haya novedades nuevas que anunciar — los usuarios
// que ya vieron una versión anterior vuelven a ver el cuadro una vez.
export const NOVEDADES_VERSION = '2026-07'

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}

function safeSet(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* Safari privado, cuota llena, etc. */ }
}

// Se marca en el momento del alta (registerWithEmail / primer login con
// Google o Facebook) para que el Dashboard sepa, en su primera carga, que
// debe mostrar la bienvenida en vez del cuadro de novedades.
export function markWelcomePending(uid: string) {
  safeSet(WELCOME_PENDING_PREFIX + uid, '1')
}

// Lee y consume de una sola vez: la bienvenida solo debe aparecer la
// primera vez que el Dashboard se monta tras el registro.
export function consumeWelcomePending(uid: string): boolean {
  const key = WELCOME_PENDING_PREFIX + uid
  const pending = safeGet(key) === '1'
  if (pending) {
    try { localStorage.removeItem(key) } catch { /* noop */ }
  }
  return pending
}

export function hasSeenNovedades(uid: string): boolean {
  return safeGet(NOVEDADES_SEEN_PREFIX + uid) === NOVEDADES_VERSION
}

export function markNovedadesSeen(uid: string) {
  safeSet(NOVEDADES_SEEN_PREFIX + uid, NOVEDADES_VERSION)
}
