import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { logout } from '../firebase/auth'
import { IconBan } from './Icons'

// Único punto de bloqueo "de app completa" para un baneo/suspensión global
// (ver src/firebase/sanctions.ts) — no puede deshabilitar el login de
// Firebase Auth en sí (el proyecto está en el plan Spark, sin Admin SDK),
// así que el usuario sancionado sigue pudiendo autenticarse, pero cualquier
// ruta protegida (dashboard, crear evento, etc.) le muestra este aviso en
// vez de su contenido normal hasta que la sanción venza o el admin la quite.
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const { banned, banMessage } = useSanctionStatus()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Cargando…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (banned) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
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

  return <>{children}</>
}
