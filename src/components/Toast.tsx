import { useEffect } from 'react'
import type { ReactNode } from 'react'
import { IconX } from './accessibility/AccessibleIcon'
import { useAnnouncer } from './accessibility/LiveRegion'

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
//
// announce() en vez de un role="status" propio: como todos los llamadores
// (GlobalToastHost, useCheckinToast, ShareEventButton) ya renderizan este
// componente, un solo punto de anuncio cubre check-in en vivo, avisos de
// email y "enlace copiado" de una vez — antes ninguno llegaba a lectores de
// pantalla.
export function Toast({ message, icon, onDismiss, tone = 'primary' }: Props) {
  const { announce } = useAnnouncer()

  useEffect(() => {
    announce(message, tone === 'warning' ? 'assertive' : 'polite')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message])

  return (
    <div
      // shadow-[var(--shadow-md)] (Design Memory: "toasts flotan con sombra
      // md") solo en claro — dark:shadow-lg mantiene la sombra de Tailwind
      // que ya tenía. bg-warning reemplaza bg-amber-600 fijo: en oscuro
      // --color-warning ya vale lo mismo que amber-600 (d97706), en claro
      // pasa al ámbar de marca nuevo.
      className={`fixed top-16 right-4 z-50 text-white text-sm rounded-lg shadow-[var(--shadow-md)] dark:shadow-lg pl-4 pr-2 py-2.5 flex items-center gap-2 max-w-xs animate-fade-in ${
        tone === 'warning' ? 'bg-warning' : 'bg-primary'
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
