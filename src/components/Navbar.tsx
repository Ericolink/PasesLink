import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useUnreadFeedbackCount } from '../hooks/useUnreadFeedbackCount'
import { optimizedImageUrl } from '../utils/cloudinary'
import { Logo } from './Logo'
import { IconMenu, IconX } from './Icons'

export function Navbar() {
  const { user } = useAuth()
  const { isAdmin } = useIsAdmin()
  const unreadFeedback = useUnreadFeedbackCount()
  const navigate = useNavigate()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  function isActive(path: string) {
    return location.pathname.includes(path)
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

  function mobileLinkClass(path: string) {
    return `px-3 py-2.5 rounded-md transition-colors ${
      isActive(path) ? 'text-white bg-white/10 font-medium' : 'text-gray-300 hover:text-white hover:bg-white/5'
    }`
  }

  async function handleLogout() {
    setMobileMenuOpen(false)
    await logout()
    navigate('/login')
  }

  function closeMobileMenu() {
    setMobileMenuOpen(false)
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
        <Link to={user ? '/dashboard' : '/'} onClick={closeMobileMenu}>
          <Logo />
        </Link>

        {user ? (
          <>
            <div className="flex items-center gap-1 text-sm">
              {isAdmin && (
                <Link to="/admin" className={`${desktopLinkClass('/admin', 'flex')} items-center gap-1.5`}>
                  Admin
                  {unreadFeedback > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
                      {unreadFeedback > 99 ? '99+' : unreadFeedback}
                    </span>
                  )}
                </Link>
              )}
              <Link to="/my-events" className={desktopLinkClass('/my-events')}>
                Mis eventos
              </Link>
              <Link to="/my-invitations" className={desktopLinkClass('/my-invitations')}>
                Mis invitaciones
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
                <span className="hidden sm:inline">{user.displayName || user.email}</span>
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

              {/* Botón hamburguesa: solo mobile. Mis eventos/Mis invitaciones/Perfil
                  quedaban inalcanzables desde celular (hidden sm:block sin
                  alternativa) — este menú es el único acceso a esas rutas ahí. */}
              <button
                onClick={() => setMobileMenuOpen((v) => !v)}
                className="sm:hidden p-2 rounded-md text-gray-300 hover:text-white hover:bg-white/5 transition-colors"
                aria-label={mobileMenuOpen ? 'Cerrar menú' : 'Abrir menú'}
                aria-expanded={mobileMenuOpen}
              >
                {mobileMenuOpen ? <IconX className="w-5 h-5" /> : <IconMenu className="w-5 h-5" />}
              </button>
            </div>

            {mobileMenuOpen && (
              <div
                className="sm:hidden absolute top-14 left-0 right-0 border-b px-4 py-3 flex flex-col gap-1 text-sm animate-fade-in"
                style={{
                  background: 'rgba(21,13,28,0.97)',
                  backdropFilter: 'blur(16px)',
                  borderColor: 'rgba(74,50,92,0.7)',
                }}
              >
                {isAdmin && (
                  <Link to="/admin" onClick={closeMobileMenu} className={`${mobileLinkClass('/admin')} flex items-center gap-1.5`}>
                    Admin
                    {unreadFeedback > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
                        {unreadFeedback > 99 ? '99+' : unreadFeedback}
                      </span>
                    )}
                  </Link>
                )}
                <Link to="/my-events" onClick={closeMobileMenu} className={mobileLinkClass('/my-events')}>
                  Mis eventos
                </Link>
                <Link to="/my-invitations" onClick={closeMobileMenu} className={mobileLinkClass('/my-invitations')}>
                  Mis invitaciones
                </Link>
                <Link to="/profile" onClick={closeMobileMenu} className={mobileLinkClass('/profile')}>
                  Perfil
                </Link>
                <button
                  onClick={handleLogout}
                  className="text-left px-3 py-2.5 rounded-md font-medium transition-colors"
                  style={{ color: '#FF1464' }}
                >
                  Cerrar sesión
                </button>
              </div>
            )}
          </>
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
