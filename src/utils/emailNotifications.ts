type Listener = (message: string) => void

const listeners = new Set<Listener>()

/**
 * Pub/sub mínimo para que módulos sin acceso a React (como emailjs.ts) puedan
 * avisar a la UI de un fallo, sin tener que pasar callbacks a través de cada
 * llamador. GlobalToastHost es el único suscriptor real hoy.
 */
export function onEmailNotification(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function emitEmailNotification(message: string) {
  listeners.forEach((listener) => listener(message))
}
