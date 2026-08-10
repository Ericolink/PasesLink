import type { ReactNode } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useMaintenanceMode } from '../hooks/useMaintenanceMode'
import { MaintenancePage } from '../pages/MaintenancePage'

// Rutas que siguen funcionando con el modo mantenimiento activado. Dos
// motivos distintos conviven en esta lista:
//  - Recuperación del administrador: /admin y el flujo de sesión
//    (/login, /forgot-password, /reset-password) siempre quedan afuera del
//    bloqueo, así "maintenanceMode: true" nunca significa que nadie —
//    incluido el propio admin, aunque haya perdido la sesión— pueda volver
//    a entrar a apagarlo.
//  - Experiencia del invitado: un mantenimiento del panel de organizador no
//    tiene por qué dejar a un invitado sin su pase, su RSVP o el operador
//    sin poder escanear en la puerta durante un evento en curso.
const MAINTENANCE_EXEMPT_PATTERNS = [
  '/admin',
  '/login',
  '/forgot-password',
  '/reset-password',
  '/pass/:eventId/:qrToken',
  '/events/:id/arrive',
  '/events/:id/join',
  '/events/:id/wall',
  '/events/:eventId/scan',
  '/e/:id',
  '/waitlist/:eventId',
]

function isExemptPath(pathname: string): boolean {
  return MAINTENANCE_EXEMPT_PATTERNS.some((pattern) => matchPath({ path: pattern, end: true }, pathname) !== null)
}

// Único punto de control de mantenimiento de toda la app — envuelve
// <SentryRoutes> en App.tsx, por encima de TODAS las rutas, en vez de que
// cada página revise el flag por su cuenta. Con maintenanceMode desactivado
// (el caso normal) es un passthrough sin costo extra: ni siquiera monta el
// listener de useIsAdmin (ver el `enabled` de ese hook).
export function MaintenanceGate({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { enabled, message, updatedAt } = useMaintenanceMode()
  const { user } = useAuth()
  const { isAdmin } = useIsAdmin(enabled)

  if (!enabled) return <>{children}</>
  if (isExemptPath(location.pathname)) return <>{children}</>
  // Un admin autenticado nunca ve la pantalla de mantenimiento, en ninguna
  // ruta — puede seguir usando la app normalmente mientras decide cuándo
  // desactivarlo, sin depender de recordar navegar a /admin primero.
  if (user && isAdmin) return <>{children}</>

  return <MaintenancePage message={message} updatedAt={updatedAt} />
}
