import { Link, useNavigate } from 'react-router-dom'
import { logout } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { isAdminEmail } from '../config/admin'
import { Logo } from './Logo'

export function Navbar() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header
      className="sticky top-0 z-40 border-b"
      style={{
        background: 'rgba(19,29,58,0.82)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'rgba(42,58,106,0.7)',
      }}
    >
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to={user ? '/dashboard' : '/'}>
          <Logo />
        </Link>

        {user ? (
          <div className="flex items-center gap-1 text-sm">
            {isAdminEmail(user.email) && (
              <Link
                to="/admin"
                className="px-3 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                Admin
              </Link>
            )}
            <Link
              to="/my-events"
              className="hidden sm:block px-3 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Mis eventos
            </Link>
            <Link
              to="/my-invitations"
              className="hidden sm:block px-3 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
            >
              Mis invitaciones
            </Link>
            <Link
              to="/profile"
              className="px-3 py-1.5 rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors flex items-center gap-2"
            >
              {user.photoURL
                ? <img src={user.photoURL} alt="" className="w-6 h-6 rounded-full object-cover" />
                : <div className="w-6 h-6 rounded-full bg-primary/30 flex items-center justify-center text-[10px] font-bold text-primary">
                    {(user.displayName || user.email || '?')[0].toUpperCase()}
                  </div>
              }
              <span className="hidden sm:inline">{user.displayName || user.email}</span>
            </Link>
            <button
              onClick={handleLogout}
              className="ml-1 px-3 py-1.5 rounded-md border text-sm font-medium transition-colors"
              style={{
                borderColor: 'rgba(255,0,77,0.4)',
                color: '#FF004D',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,0,77,0.12)'
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
