import { useEffect, useRef, type RefObject } from 'react'

// Mueve el foco a `ref` cada vez que `dependency` cambia (ej. el paso actual
// de un wizard) — sin robarle el foco a nada en el montaje inicial. Compara
// contra el valor anterior en un ref (no un booleano `isFirstRender`): en el
// primer render, `previous.current` ya vale `dependency` (mismo valor
// inicial), así que la condición es falsa sola, sin necesitar un flag aparte
// — mismo patrón que ya corrigió un bug real de RouteAnnouncer bajo
// StrictMode (la doble invocación de efectos en dev no dispara un foco
// espurio, porque el ref sobrevive esa doble pasada).
export function useFocusOnChange<T extends HTMLElement>(dependency: unknown, ref: RefObject<T | null>) {
  const previous = useRef(dependency)

  useEffect(() => {
    if (previous.current !== dependency) {
      ref.current?.focus()
    }
    previous.current = dependency
  }, [dependency, ref])
}
