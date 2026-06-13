import { Link } from 'react-router-dom'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer className="border-t border-gray-200 bg-white mt-12">
      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500 text-center sm:text-left">
        <Logo />
        <p>
          © {new Date().getFullYear()} PaseLink · Desarrollado por{' '}
          <span className="font-medium text-gray-700">ericolink</span>
        </p>
        <div className="flex items-center gap-4">
          <Link to="/" className="hover:text-primary transition-colors">
            Inicio
          </Link>
          <Link to="/terminos" className="hover:text-primary transition-colors">
            Términos
          </Link>
          <Link to="/privacidad" className="hover:text-primary transition-colors">
            Privacidad
          </Link>
        </div>
      </div>
    </footer>
  )
}
