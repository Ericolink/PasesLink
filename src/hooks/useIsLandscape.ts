import { useEffect, useState } from 'react'

// Detecta la orientación vía matchMedia — más confiable entre navegadores
// que window.orientation (deprecado) o screen.orientation (sin soporte en
// Safari/iOS). Solo expone el estado; no fuerza ningún redibujado en quien
// lo consume, así que un componente con estado costoso de reiniciar (como
// el escáner de cámara) puede decidir mostrar una guía sin desmontar nada.
export function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(orientation: landscape)').matches,
  )

  useEffect(() => {
    const mql = window.matchMedia('(orientation: landscape)')
    const handler = (e: MediaQueryListEvent) => setIsLandscape(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return isLandscape
}
