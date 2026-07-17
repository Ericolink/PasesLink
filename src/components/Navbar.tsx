import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { optimizedImageUrl } from '../utils/cloudinary'
import { Logo } from './Logo'

export function Navbar() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  function isActive(path: string) {
    return location.pathname === path || (path === '/dashboard' && location.pathname.startsWith('/events/'))
  }

  function desktopLinkClass(path: string) {
    // min-h-11 + items-center: antes centraba el texto con solo padding
    // vertical (py-1.5, ~32px de alto) — inline-flex sirve tanto para los
    // links de solo texto como para el de Perfil (ícono + texto).
    return `hidden sm:inline-flex min-h-11 items-center px-3 rounded-md transition-colors border-b-2 ${
      isActive(path)
        ? 'text-gray-900 dark:text-white bg-gray-900/5 dark:bg-white/10 border-primary'
        : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-900/5 dark:hover:bg-white/5 border-transparent'
    }`
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="app-header sticky top-0 z-40 border-b"
      style={{
        background: 'var(--app-chrome-bg)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'var(--app-chrome-border)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to={user ? '/dashboard' : '/'}>
          {/* En mobile, Navbar solo muestra el logo (Inicio/Invitaciones/
              Perfil quedan en BottomTabBar, ver desktopLinkClass) — el
              espacio sobra, así que el logo crece; desde sm: conviven con
              los links de acá y vuelve al tamaño de siempre. */}
          <Logo className="h-12 sm:h-9" />
        </Link>

        {user ? (
          <div className="flex items-center gap-1 text-sm">
            <Link to="/dashboard" className={desktopLinkClass('/dashboard')}>
              Inicio
            </Link>
            <Link to="/my-invitations" className={desktopLinkClass('/my-invitations')}>
              Invitaciones
            </Link>
            <Link
              to="/profile"
              className={`${desktopLinkClass('/profile')} gap-2`}
            >
              {user.photoURL
                ? <img src={optimizedImageUrl(user.photoURL, 48)} alt="" loading="lazy" className="w-6 h-6 rounded-full object-cover" />
                : <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-2xs font-bold text-primary">
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <span className="hidden sm:inline">Perfil</span>
            </Link>
            <button
              onClick={handleLogout}
              className="hidden sm:inline-flex min-h-11 items-center ml-1 px-3 rounded-md border text-sm font-medium transition-colors"
              style={{
                borderColor: 'rgba(255,20,100,0.4)',
                color: 'var(--color-primary)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,20,100,0.12)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
              }}
            >
              Salir
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-sm">
            <Link
              to="/login"
              className="min-h-11 inline-flex items-center px-3 rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-900/5 dark:hover:bg-white/5 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="min-h-11 inline-flex items-center bg-primary text-white rounded-md px-4 font-medium hover:bg-primary-dark transition-colors"
            >
              Registrarse
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
