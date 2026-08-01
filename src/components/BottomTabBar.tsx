import type { ComponentType } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { IconHome, IconPlus, IconTicket, IconUser } from './accessibility/AccessibleIcon'

type Tab = {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  isActive: (pathname: string) => boolean
}

// "Inicio" queda activo también dentro del detalle de un evento: en la
// nueva arquitectura, EventDetail/Reports son un drill-down de Inicio,
// no una sección propia (ver propuesta de navegación).
const LEFT_TABS: Tab[] = [
  { to: '/dashboard', label: 'Inicio', icon: IconHome, isActive: (p) => p === '/dashboard' || p.startsWith('/events/') },
  { to: '/my-invitations', label: 'Invitaciones', icon: IconTicket, isActive: (p) => p === '/my-invitations' },
]
const RIGHT_TABS: Tab[] = [{ to: '/profile', label: 'Perfil', icon: IconUser, isActive: (p) => p === '/profile' }]

function TabLink({ to, label, icon: Icon, isActive }: Tab) {
  const location = useLocation()
  const active = isActive(location.pathname)
  return (
    <Link
      to={to}
      className="flex-1 flex flex-col items-center justify-center gap-1 py-2.5 text-2xs font-medium transition-colors"
      style={{ color: active ? 'var(--color-primary)' : 'var(--color-gray-500)' }}
      aria-current={active ? 'page' : undefined}
    >
      <Icon className="w-5 h-5" />
      {label}
    </Link>
  )
}

// Único punto de acceso permanente a los 3 destinos raíz en mobile, más
// "Crear evento". Reemplaza al acordeón hamburguesa de Navbar (fase 1 del
// rediseño de navegación). Desktop sigue usando Navbar hasta la fase 6.
export function BottomTabBar() {
  const { user } = useAuth()

  if (!user) return null

  return (
    <nav
      aria-label="Navegación principal"
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
      {LEFT_TABS.map((tab) => (
        <TabLink key={tab.to} {...tab} />
      ))}
      {/* "Crear evento" (Design Memory: "bottom-nav móvil con FAB central
          pink+glow") es una celda flex propia, del mismo ancho que los
          demás tabs — no un elemento "position: absolute" superpuesto a
          toda la barra. Con 3 tabs, el centro de la barra completa cae
          exactamente sobre el tab del medio, así que centrar el FAB ahí
          garantizaba tapar ese botón sin importar el ajuste de píxeles.
          Reservarle su propia columna elimina el solapamiento de raíz: el
          "+" se posiciona absolute centrado dentro de ESA celda (no de la
          barra) y sobresale hacia arriba para conservar el efecto flotante
          con glow, pero nunca puede invadir el ancho de un hermano. */}
      <div className="flex-1 relative flex flex-col items-center justify-end gap-1 py-2.5">
        <Link
          to="/events/new"
          aria-label="Crear evento"
          className="absolute left-1/2 -translate-x-1/2 -top-6 w-14 h-14 rounded-2xl flex items-center justify-center text-white bg-primary transition-transform active:scale-95"
          style={{ boxShadow: 'var(--shadow-glow)' }}
        >
          <IconPlus className="w-6 h-6" />
        </Link>
        <span className="text-2xs font-medium" style={{ color: 'var(--color-gray-500)' }}>
          Crear
        </span>
      </div>
      {RIGHT_TABS.map((tab) => (
        <TabLink key={tab.to} {...tab} />
      ))}
    </nav>
  )
}
