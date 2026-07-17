import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useModalA11y } from '../hooks/useModalA11y'

type ModalVariant = 'sheet' | 'dialog'

interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  label: string
  /** Clase `max-w-*` a partir de `sm:` — la mayoría de los overlays de la
      app usan `sm:max-w-sm`, algunos (con más contenido) necesitan más. */
  maxWidth?: string
  /** 'sheet' (default): bottom sheet en mobile, modal centrado desde `sm:`
      — la mayoría de los overlays de cara al invitado/organizador.
      'dialog': siempre centrado, radio uniforme (`rounded-2xl`), sin la
      variante mobile — lo usan los paneles de moderación de Admin, que no
      tienen versión mobile-first propia (ver AdminReportDetail/
      AdminFeedbackDetail). */
  variant?: ModalVariant
  /** Reemplaza (no se agrega a) `bg-white dark:bg-gray-800` — para overlays
      que viven dentro de una invitación temática y necesitan
      `bg-[var(--invite-surface)]` (ver GuestEditModal). Un className normal
      NO alcanza acá: al ser la misma propiedad CSS (background-color),
      Tailwind decide quién gana por orden de aparición en el stylesheet
      generado, no por dónde aparece la clase en el string — verificado
      contra el CSS compilado, no es confiable para casos como este. */
  surfaceClassName?: string
  className?: string
}

// Backdrop + contenedor + animación compartidos por los overlays de la app —
// hasta este PR, el mismo bloque `fixed inset-0 z-[200] flex items-end
// sm:items-center ... bg-black/50 backdrop-blur-sm` estaba copiado letra por
// letra en 11 archivos. Incluye accesibilidad (foco/Escape) y bloqueo de
// scroll vía useModalA11y (ver PR 02). El click en el backdrop cierra el
// modal — si un caller necesita una decisión forzada sin salida por click
// afuera (ver DraftRecoveryModal), puede pasar un `onClose` que no haga nada.
//
// z-[200] literal (no hay namespace de tema para z-index en Tailwind v4 —
// a diferencia de colores/spacing/tipografía, --z-* no genera clases, se
// probó y confirmó vacío en el build) — la consistencia entre overlays
// ahora viene de que todos pasan por este único componente, no de un token.
export function Modal({
  open,
  onClose,
  children,
  label,
  maxWidth = 'sm:max-w-sm',
  variant = 'sheet',
  surfaceClassName = 'bg-white dark:bg-gray-800',
  className = '',
}: ModalProps) {
  const dialogRef = useModalA11y<HTMLDivElement>(open, onClose)

  if (!open) return null

  const backdropClass = variant === 'dialog'
    ? 'fixed inset-0 z-[200] flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/50 backdrop-blur-sm'
    : 'fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-black/50 backdrop-blur-sm'

  const panelClass = variant === 'dialog'
    ? `${surfaceClassName} rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[85dvh] flex flex-col animate-bounce-in`
    : `${surfaceClassName} rounded-t-2xl sm:rounded-2xl shadow-2xl w-full ${maxWidth} max-h-[85dvh] flex flex-col animate-bounce-in`

  return createPortal(
    <div className={backdropClass} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={label} className={`${panelClass} ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
