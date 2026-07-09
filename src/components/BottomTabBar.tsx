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
        background: 'rgba(21,13,28,0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'rgba(74,50,92,0.7)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ to, label, icon: Icon, isActive }) => {
        const active = isActive(location.pathname)
        return (
          <Link
            key={to}
            to={to}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors"
            style={{ color: active ? '#FF1464' : '#8D8298' }}
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
