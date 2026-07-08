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

  function desktopLinkClass(path: string, display: 'block' | 'flex' = 'block') {
    // Las clases de Tailwind deben aparecer completas y literales en el código
    // para que el scanner las detecte — por eso el ternario no interpola
    // "sm:" + display, sino que escribe ambas clases completas.
    const displayClass = display === 'flex' ? 'sm:flex' : 'sm:block'
    return `hidden ${displayClass} px-3 py-1.5 rounded-md transition-colors border-b-2 ${
      isActive(path)
        ? 'text-white bg-white/10 border-primary'
        : 'text-gray-400 hover:text-white hover:bg-white/5 border-transparent'
    }`
  }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'rgba(21,13,28,0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'rgba(74,50,92,0.7)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to={user ? '/dashboard' : '/'}>
          <Logo />
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
              className={`${desktopLinkClass('/profile', 'flex')} items-center gap-2`}
            >
              {user.photoURL
                ? <img src={optimizedImageUrl(user.photoURL, 48)} alt="" loading="lazy" className="w-6 h-6 rounded-full object-cover" />
                : <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <span className="hidden sm:inline">Perfil</span>
            </Link>
            <button
              onClick={handleLogout}
              className="hidden sm:inline-block ml-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors"
              style={{
                borderColor: 'rgba(255,20,100,0.4)',
                color: '#FF1464',
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
              className="px-3 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="bg-primary text-white rounded-md px-4 py-1.5 font-medium hover:bg-primary-dark transition-colors"
            >
              Registrarse
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
