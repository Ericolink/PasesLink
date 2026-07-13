import type { ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { IconHome, IconTicket, IconUser } from './Icons'

type Tab = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  isActive: (pathname: string) => boolean
}

// "Inicio" queda activo también dentro del detalle de un evento: en la
// nueva arquitectura, EventDetail/Reports son un drill-down de Inicio,
// no una sección propia (ver propuesta de navegación).
const TABS: Tab[] = [
  { to: '/dashboard', label: 'Inicio', icon: IconHome, isActive: (p) => p === '/dashboard' || p.startsWith('/events/') },
  { to: '/my-invitations', label: 'Invitaciones', icon: IconTicket, isActive: (p) => p === '/my-invitations' },
  { to: '/profile', label: 'Perfil', icon: IconUser, isActive: (p) => p === '/profile' },
]

// Único punto de acceso permanente a los 3 destinos raíz en mobile.
// Reemplaza al acordeón hamburguesa de Navbar (fase 1 del rediseño de
// navegación). Desktop sigue usando Navbar hasta la fase 6.
export function BottomTabBar() {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return null

  return (
    <nav
      className="app-tabbar sm:hidden fixed bottom-0 left-0 right-0 z-40 border-t flex"
      style={{
        background: 'var(--app-chrome-bg-tabbar)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'var(--app-chrome-border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
        // En landscape en un dispositivo con notch (ej. iPhone acostado),
        // sin esto los tabs de los extremos quedan pegados/tapados por el
        // borde curvo o la cámara — mismo criterio que ya se aplicaba solo
        // a "bottom".
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      {TABS.map(({ to, label, icon: Icon, isActive }) => {
        const active = isActive(location.pathname)
        return (
          <Link
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            style={{ color: active ? 'var(--color-primary)' : 'var(--color-gray-500)' }}
            aria-current={active ? 'page' : undefined}
          >
            <Icon className="w-5 h-5" />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
