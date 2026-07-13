import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { TemplateId } from '../types'
import { ThemeOrnament } from './ThemeOrnament'
import { IconArrowLeft } from './Icons'

type ScreenHeaderProps = {
  /** Título de la sección — siempre visible, nunca depende de recordar dónde tocaste. */
  title: string
  /**
   * Ruta fija de retorno. Es intencional que no sea `navigate(-1)`: el
   * historial del navegador puede venir de cualquier lado (un enlace externo,
   * una pestaña nueva), y "volver" siempre debe ir a un lugar predecible
   * dentro de la app, no a donde sea que el usuario haya estado antes.
   */
  backTo?: string
  action?: ReactNode
  /**
   * Plantilla del evento — solo la pasan las pantallas que ya viven dentro
   * de un evento (EventDetail, Reports). Únicamente habilita el ornamento
   * junto al título; el resto de la identidad de plantilla (fondo, borde,
   * tipografía del h1) llega sola vía CSS ([data-dash-template] en
   * index.css), reaccionando a los custom properties que ya setea
   * useDashboardTheme en document.documentElement — cero prop-drilling
   * extra para eso. Sin plantilla (o 'default'), data-dash-template no
   * existe y el header conserva el look base de siempre.
   */
  templateId?: TemplateId
}

// Reemplaza los "← Volver a X" copiados a mano en cada pantalla. Un solo
// componente para título + volver + acción contextual (fase 3 del
// rediseño de navegación).
export function ScreenHeader({ title, backTo, action, templateId }: ScreenHeaderProps) {
  return (
    // static en mobile (no sm:): con Navbar ya fijo arriba (h-14, sticky
    // top-0), este header también sticky sumaba un segundo bloque fijo
    // permanente — en mobile (donde BottomTabBar ya ancla la navegación
    // principal) alcanza con que se desplace con el contenido; desde `sm:`
    // el layout tiene más aire vertical y se mantiene sticky como antes.
    <header className="dash-header static sm:sticky sm:top-14 z-30 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-gray-100/90 backdrop-blur px-1 py-3 mb-4">
      {backTo && (
        <Link
          to={backTo}
          aria-label="Volver"
          className="shrink-0 -ml-2 min-w-11 min-h-11 inline-flex items-center justify-center rounded-full text-gray-500 hover:text-primary hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 transition-colors"
        >
          <IconArrowLeft className="w-5 h-5" />
        </Link>
      )}
      <h1 className="dash-header-title text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
      {templateId && <ThemeOrnament templateId={templateId} className="dash-header-ornament w-7 h-4 shrink-0" />}
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  )
}
