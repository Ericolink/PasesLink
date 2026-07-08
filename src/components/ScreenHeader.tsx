import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
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
}

// Reemplaza los "← Volver a X" copiados a mano en cada pantalla. Un solo
// componente para título + volver + acción contextual (fase 3 del
// rediseño de navegación).
export function ScreenHeader({ title, backTo, action }: ScreenHeaderProps) {
  return (
    <header className="sticky top-14 z-30 flex items-center gap-3 border-b border-gray-200 dark:border-gray-800 bg-white/90 dark:bg-[#150D1C]/90 backdrop-blur px-1 py-3 mb-4">
      {backTo && (
        <Link
          to={backTo}
          aria-label="Volver"
          className="shrink-0 -ml-1 p-1.5 rounded-full text-gray-500 hover:text-primary hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 transition-colors"
        >
          <IconArrowLeft className="w-5 h-5" />
        </Link>
      )}
      <h1 className="text-base font-semibold text-gray-900 dark:text-white truncate">{title}</h1>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </header>
  )
}
