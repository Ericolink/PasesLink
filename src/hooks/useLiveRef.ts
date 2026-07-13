import { useEffect, useRef } from 'react'

// Un callback registrado UNA sola vez (ej. el listener de frame de una
// librería de cámara, o cualquier suscripción que no se vuelve a crear en
// cada render) captura el valor de un state/prop tal como era en ese
// primer render — si ese callback necesita leer el valor ACTUAL más
// adelante, tiene que hacerlo a través de un ref que un efecto mantiene
// sincronizado, no leyendo el state directo. Este hook es ese patrón
// (antes repetido a mano 4 veces en Scanner.tsx: eventRef, scanModeRef,
// pendingExitRef, feedbackRef) reducido a una sola línea por valor.
export function useLiveRef<T>(value: T) {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}
