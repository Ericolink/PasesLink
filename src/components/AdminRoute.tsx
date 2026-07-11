import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { CrownLoader } from './CrownLoader'

export function AdminRoute({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth()
  const { isAdmin, loading: adminLoading } = useIsAdmin()

  if (authLoading || adminLoading) {
    return <CrownLoader />
  }

  if (!user || !isAdmin) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
