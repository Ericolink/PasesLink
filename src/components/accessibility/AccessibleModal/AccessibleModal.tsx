import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useAccessibleModal } from './useAccessibleModal'

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
  /** 'dialog' (default): contenido informativo/de edición normal.
      'alertdialog': para confirmaciones que interrumpen y exigen una
      respuesta antes de seguir (ver APG Alert Dialog) — usarlo en
      confirmaciones destructivas (`ConfirmDialog` con `danger`), no en
      diálogos informativos. */
  role?: 'dialog' | 'alertdialog'
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
// scroll vía useAccessibleModal (ver PR 02). El click en el backdrop cierra el
// modal — si un caller necesita una decisión forzada sin salida por click
// afuera (ver DraftRecoveryModal), puede pasar un `onClose` que no haga nada.
//
// z-[200] literal (no hay namespace de tema para z-index en Tailwind v4 —
// a diferencia de colores/spacing/tipografía, --z-* no genera clases, se
// probó y confirmó vacío en el build) — la consistencia entre overlays
// ahora viene de que todos pasan por este único componente, no de un token.
export function AccessibleModal({
  open,
  onClose,
  children,
  label,
  maxWidth = 'sm:max-w-sm',
  variant = 'sheet',
  role = 'dialog',
  // bg-surface ya se ramifica solo (blanco en claro, el mismo translúcido
  // rgba(30,20,40,.88) que antes daba dark:bg-gray-800 en oscuro — ver
  // --color-surface en index.css), así que no hace falta el dark: aparte.
  surfaceClassName = 'bg-surface',
  className = '',
}: ModalProps) {
  const dialogRef = useAccessibleModal<HTMLDivElement>(open, onClose)

  if (!open) return null

  // Scrim ink-900@42% (Design Memory) en vez de negro puro; en oscuro
  // --scrim vuelve al negro/50 original, sin cambios ahí.
  const backdropClass = variant === 'dialog'
    ? 'fixed inset-0 z-[200] flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-[var(--scrim)] backdrop-blur-sm'
    : 'fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4 pb-[env(safe-area-inset-bottom)] sm:pb-0 bg-[var(--scrim)] backdrop-blur-sm'

  // rounded-xl (24px) y no rounded-2xl (30px, reservado a superficies más
  // grandes) — "sheet con grabber y radio 24 solo arriba" (Design Memory).
  // shadow-[var(--shadow-lg)] reemplaza shadow-2xl: en oscuro --shadow-lg
  // ya está calibrado para verse igual que el shadow-2xl que había antes.
  const panelClass = variant === 'dialog'
    ? `${surfaceClassName} rounded-xl shadow-[var(--shadow-lg)] w-full ${maxWidth} max-h-[85dvh] flex flex-col animate-bounce-in`
    : `${surfaceClassName} rounded-t-xl sm:rounded-xl shadow-[var(--shadow-lg)] w-full ${maxWidth} max-h-[85dvh] flex flex-col animate-bounce-in`

  return createPortal(
    <div className={backdropClass} onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div ref={dialogRef} role={role} aria-modal="true" aria-label={label} className={`${panelClass} ${className}`}>
        {children}
      </div>
    </div>,
    document.body,
  )
}
