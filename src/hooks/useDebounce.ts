import { useEffect, useState } from 'react'

// Devuelve `value` con retraso: se actualiza recién `delayMs` después de que
// `value` deja de cambiar. Usado para no recalcular filtros/consultas en
// cada tecla cuando la fuente son listas grandes (ver GuestSearchBar).
export function useDebounce<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
