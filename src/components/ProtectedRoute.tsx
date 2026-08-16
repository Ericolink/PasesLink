import type { ReactNode } from 'react'
import { matchPath, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { logout } from '../firebase/auth'
import { getPendingLegalAcceptance } from '../legal/documents'
import { IconBan } from './accessibility/AccessibleIcon'
import { CrownLoader } from './CrownLoader'
import { LegalReacceptanceScreen } from './LegalReacceptanceScreen'

// Rutas protegidas donde NO se debe interrumpir con el aviso de
// re-aceptación legal, aunque el usuario tenga una versión pendiente:
//  - /events/:eventId/scan: escanear el acceso en la puerta de un evento en
//    vivo no puede quedar bloqueado por un aviso legal a mitad de la fila
//    (decisión explícita del usuario, mismo criterio que ya usa
//    MAINTENANCE_EXEMPT_PATTERNS en MaintenanceGate.tsx para el mismo caso).
//  - /complete-profile: la propia pantalla ya pide aceptar los documentos
//    vigentes como parte de su propio formulario (primer guardado de perfil
//    tras Google) — interceptarla con este aviso ANTES de que el usuario
//    llegue a ese checkbox le impediría completar su perfil.
const LEGAL_GATE_EXEMPT_PATTERNS = ['/events/:eventId/scan', '/complete-profile']

function isLegalGateExempt(pathname: string): boolean {
  return LEGAL_GATE_EXEMPT_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null)
}

// Único punto de bloqueo "de app completa" para un baneo/suspensión global
// (ver src/firebase/sanctions.ts) — no puede deshabilitar el login de
// Firebase Auth en sí (el proyecto está en el plan Spark, sin Admin SDK),
// así que el usuario sancionado sigue pudiendo autenticarse, pero cualquier
// ruta protegida (dashboard, crear evento, etc.) le muestra este aviso en
// vez de su contenido normal hasta que la sanción venza o el admin la quite.
//
// También es el único punto donde se pide re-aceptar Términos/Privacidad
// cuando se publica una versión nueva (ver src/legal/documents.ts). Vive acá
// (no envolviendo <SentryRoutes> como MaintenanceGate) porque el gate solo
// tiene sentido para rutas que ya exigen sesión — así una ruta pública que
// un usuario logueado visite de paso (la landing, /terminos) nunca queda
// bloqueada por esto, sin necesidad de una lista de exención tan larga como
// la de mantenimiento.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { banned, banMessage } = useSanctionStatus()
  const { profile, loadingProfile } = useUserProfile()
  const location = useLocation()

  if (loading) {
    return <CrownLoader />
  }

  if (!user) {
    // Guarda de dónde venía (path + query) para que Login.tsx pueda volver
    // ahí después de autenticar, en vez de mandar siempre a /dashboard —
    // antes, un link directo a una ruta protegida (ej. compartido por otro
    // organizador) que forzaba pasar por /login perdía el destino original.
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  if (banned) {
    return (
      <div className="flex items-center justify-center min-h-dvh p-4">
        <div className="max-w-sm w-full text-center bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-8">
          <div className="mx-auto w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
            <IconBan className="w-6 h-6 text-red-600 dark:text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">Cuenta suspendida</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">{banMessage}</p>
          <button
            onClick={() => logout()}
            className="text-sm font-medium text-primary hover:text-primary-dark"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    )
  }

  // "Fail open" a propósito, mismo criterio que useMaintenanceMode: mientras
  // el perfil todavía no cargó su primer snapshot, no bloqueamos — más vale
  // un flash breve del contenido real para alguien con aceptación pendiente
  // que bloquear a todo el mundo por una lectura que puede tardar.
  if (!loadingProfile && !isLegalGateExempt(location.pathname)) {
    const pending = getPendingLegalAcceptance(profile?.legalAcceptedVersions)
    if (pending.length > 0) {
      return <LegalReacceptanceScreen uid={user.uid} pendingLabels={pending.map((d) => d.label)} />
    }
  }

  return <>{children}</>
}
