import { Link } from 'react-router-dom'
import { Logo } from './Logo'
import { IconGithub, IconInstagram } from './Icons'

const GITHUB_URL = 'https://github.com/Ericolink'
const INSTAGRAM_URL = 'https://www.instagram.com/paselink/'

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

      <div className="max-w-5xl mx-auto px-4 py-10 text-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-8">
          <div>
            <Logo />
            <p className="text-xs text-gray-500 mt-3 max-w-[220px] leading-relaxed">
              Invitaciones digitales y check-in con QR para tus eventos.
            </p>
          </div>

          <div className="flex gap-12 sm:gap-16">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Enlaces</p>
              <nav className="flex flex-col gap-2">
                <Link to="/" className="text-gray-400 hover:text-primary transition-colors">
                  Inicio
                </Link>
                <Link to="/terminos" className="text-gray-400 hover:text-primary transition-colors">
                  Términos
                </Link>
                <Link to="/privacidad" className="text-gray-400 hover:text-primary transition-colors">
                  Privacidad
                </Link>
              </nav>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 mb-3">Síguenos</p>
              <div className="flex items-center gap-2">
                <a
                  href={GITHUB_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="GitHub de Ericolink"
                  title="GitHub"
                  className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <IconGithub className="w-4 h-4" />
                </a>
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram de PaseLink"
                  title="Instagram"
                  className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <IconInstagram className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>

        <div
          className="mt-8 pt-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs"
          style={{ borderTop: '1px solid rgba(74,50,92,0.5)' }}
        >
          <p className="text-gray-500">
            © {new Date().getFullYear()} PaseLink · por{' '}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-gray-400 hover:text-primary transition-colors"
            >
              Ericolink
            </a>
          </p>
          <p className="text-gray-600 italic">Hecho con ❤️, café ☕ y cero presupuesto.</p>
        </div>
      </div>
    </footer>
  )
}
