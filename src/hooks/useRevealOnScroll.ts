import { useEffect, useRef, useState } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

interface UseRevealOnScrollResult<T extends HTMLElement> {
  ref: React.RefObject<T | null>
  revealed: boolean
  className: string
}

// Revela una sección con una animación de entrada sutil la primera vez que
// entra al viewport — usado por las secciones nuevas de la invitación
// rediseñada de Fiesta Improvisada para incentivar el scroll (ver
// INVITATION_REDESIGN_PLAN §17). Reutiliza las animaciones ya definidas en
// index.css (mismas que EnterAnimation de templates/registry.ts, sin
// keyframes nuevos) — esas clases ya tienen su propio
// `@media (prefers-reduced-motion: reduce)` que las desactiva y fuerza
// opacity:1, así que con movimiento reducido el contenido aparece de una,
// nunca escondido.
export function useRevealOnScroll<T extends HTMLElement>(animationClass = 'animate-fade-in-up'): UseRevealOnScrollResult<T> {
  const ref = useRef<T>(null)
  const [revealed, setRevealed] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()

  useEffect(() => {
    if (revealed || prefersReducedMotion) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setRevealed(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [revealed, prefersReducedMotion])

  const isRevealed = revealed || prefersReducedMotion
  return { ref, revealed: isRevealed, className: isRevealed ? animationClass : 'opacity-0' }
}
