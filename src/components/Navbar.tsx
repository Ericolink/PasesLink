import { Link, useNavigate } from 'react-router-dom'
import { logout } from '../firebase/auth'
import { useAuth } from '../hooks/useAuth'
import { Logo } from './Logo'

export function Navbar() {
  const { user } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  return (
    <header className="border-b border-gray-200 bg-white sticky top-0 z-40">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
        <Link to={user ? '/dashboard' : '/'}>
          <Logo />
        </Link>
        {user ? (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-500 hidden sm:inline">{user.email}</span>
            <button
              onClick={handleLogout}
              className="text-gray-600 hover:text-primary transition-colors"
            >
              Cerrar sesión
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4 text-sm">
            <Link to="/login" className="text-gray-600 hover:text-primary transition-colors">
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="bg-primary text-white rounded-md px-3 py-1.5 font-medium hover:bg-primary-dark transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        )}
      </div>
    </header>
  )
}
