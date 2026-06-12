import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { isAdminEmail } from '../config/admin'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()

  if (loading) {
    return <div className="flex items-center justify-center min-h-screen text-gray-500">Cargando...</div>
  }

  if (!user || !isAdminEmail(user.email)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
