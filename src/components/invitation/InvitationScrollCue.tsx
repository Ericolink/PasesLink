import { useEffect, useState } from 'react'
import { useRevealOnScroll } from '../../hooks/useRevealOnScroll'
import { IconChevronDown } from '../accessibility/AccessibleIcon'

// "Hay más en tu invitación ↓" — aparece una vez, cuando el bloque de
// información principal entra en viewport, y se oculta para siempre en
// cuanto el invitado sigue haciendo scroll y lo deja atrás (nunca vuelve a
// aparecer, no es un banner persistente — ver INVITATION_REDESIGN_PLAN §17).
// Puramente decorativo (aria-hidden): el orden real de la página ya guía a
// quien usa lector de pantalla sin depender de este empujón visual.
export function InvitationScrollCue() {
  const { ref, revealed, className } = useRevealOnScroll<HTMLDivElement>('animate-fade-in')
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (!revealed || dismissed) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) setDismissed(true)
      },
      { threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed, dismissed])

  if (dismissed) return null

  return (
    <div ref={ref} aria-hidden="true" className={`flex items-center justify-center gap-2 py-1 text-xs font-medium text-[var(--invite-text-muted)] ${className}`}>
      <span>Hay más en tu invitación</span>
      <IconChevronDown className="w-3.5 h-3.5 animate-float" />
    </div>
  )
}
