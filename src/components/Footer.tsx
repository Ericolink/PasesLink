import { Link } from 'react-router-dom'
import { Logo } from './Logo'

export function Footer() {
  return (
    <footer
      className="relative z-0 mt-12"
      style={{
        background: 'rgba(16,10,22,0.92)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Línea neon superior */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 0, left: '8%', right: '8%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,20,100,.5) 30%, rgba(232,184,75,.3) 70%, transparent)',
        }}
      />

      <div className="max-w-5xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <Logo />

        <p className="text-gray-500">
          © {new Date().getFullYear()} PaseLink · por{' '}
          <span className="font-medium text-gray-400">ericolink</span>
        </p>

        <div className="flex items-center gap-5">
          <Link to="/" className="text-gray-500 hover:text-primary transition-colors">
            Inicio
          </Link>
          <Link to="/terminos" className="text-gray-500 hover:text-primary transition-colors">
            Términos
          </Link>
          <Link to="/privacidad" className="text-gray-500 hover:text-primary transition-colors">
            Privacidad
          </Link>
        </div>
      </div>
    </footer>
  )
}
