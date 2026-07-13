import type { ReactNode } from 'react'
import { IconX } from './Icons'

interface Props {
  message: string
  icon?: ReactNode
  onDismiss: () => void
  tone?: 'primary' | 'warning'
}

// Toast flotante compartido — antes GlobalToastHost.tsx (avisos de email) y
// EventDetail.tsx (check-ins en vivo) duplicaban la misma tarjeta fixed
// top-16 right-4 sin botón de cierre: solo desaparecían solas, sin forma de
// descartarlas antes de que expire su timer. El auto-dismiss lo sigue
// manejando cada caller (setTimeout propio) — este componente solo agrega la
// posibilidad de cerrarla antes.
export function Toast({ message, icon, onDismiss, tone = 'primary' }: Props) {
  return (
    <div
      className={`fixed top-16 right-4 z-50 text-white text-sm rounded-lg shadow-lg pl-4 pr-2 py-2.5 flex items-center gap-2 max-w-xs animate-fade-in ${
        tone === 'warning' ? 'bg-amber-600' : 'bg-primary'
      }`}
    >
      {icon}
      <span className="flex-1">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Cerrar aviso"
        className="shrink-0 -m-2 min-w-11 min-h-11 inline-flex items-center justify-center text-white/70 hover:text-white"
      >
        <IconX className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
