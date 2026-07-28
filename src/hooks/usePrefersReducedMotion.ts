import { useEffect, useState } from 'react'

// Mismo patrón que useIsLandscape.ts (matchMedia + listener de 'change').
// El CSS de la app ya respeta prefers-reduced-motion en 8 lugares distintos
// (ver index.css) desactivando animación por completo — este hook es el
// equivalente para el único efecto que CSS no puede tocar: el confetti
// (canvas-confetti, JS puro). Los callers deben suprimir la llamada a
// confetti() por completo cuando esto da true, no reducirla, para quedar
// consistente con el criterio ya usado en el CSS.
export function usePrefersReducedMotion(): boolean {
  const [prefersReduced, setPrefersReduced] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handler = (e: MediaQueryListEvent) => setPrefersReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return prefersReduced
}
