import type { ReactNode } from 'react'
import { IconX } from './Icons'

interface Props {
  icon: ReactNode
  onDismiss?: () => void
  dismissLabel?: string
  children: ReactNode
  /** true cuando vive dentro de un <NoticeStack> — pierde su propio
   * borde/fondo/margen porque el contenedor ya los provee (ver NoticeStack). */
  grouped?: boolean
}

// Aviso inline no bloqueante, temeado con --invite-*. Extraído de
// InAppBrowserBanner/GuestPass para que ambos avisos (navegador integrado y
// multi-dispositivo) compartan una sola implementación visual en vez de dos
// bloques duplicados con divergencia silenciosa a futuro.
export function InlineNotice({ icon, onDismiss, dismissLabel = 'Cerrar aviso', children, grouped = false }: Props) {
  return (
    <div
      className={`flex items-start gap-2 px-3 py-2.5 text-left text-sm ${grouped ? '' : 'mb-4 rounded-lg border border-[var(--invite-border)] bg-[var(--invite-surface)]'}`}
    >
      <div className="w-4 h-4 mt-0.5 flex-shrink-0">{icon}</div>
      <div className="flex-1">{children}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className="shrink-0 -m-2 min-w-11 min-h-11 inline-flex items-center justify-center text-[var(--invite-text-muted)] hover:text-[var(--invite-text)]"
        >
          <IconX className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  )
}
