import { createContext, useContext, useCallback, useRef, useState, type ReactNode } from 'react'

type Politeness = 'polite' | 'assertive'

interface AnnouncementContextValue {
  announce: (message: string, politeness?: Politeness) => void
}

const AnnouncementContext = createContext<AnnouncementContextValue | null>(null)

const DEDUPE_WINDOW_MS = 500

// Dos regiones fijas (nunca desmontadas) en vez de una sola con `aria-live`
// dinámico: varios lectores de pantalla no reaccionan de forma fiable a un
// cambio de `aria-live` en caliente, así que "polite" y "assertive" viven en
// nodos separados desde el montaje.
export function AnnouncementProvider({ children }: { children: ReactNode }) {
  const [politeMessage, setPoliteMessage] = useState('')
  const [assertiveMessage, setAssertiveMessage] = useState('')
  const lastPolite = useRef<{ message: string; at: number }>({ message: '', at: 0 })
  const lastAssertive = useRef<{ message: string; at: number }>({ message: '', at: 0 })

  const announce = useCallback((message: string, politeness: Politeness = 'polite') => {
    if (!message) return
    const setMessage = politeness === 'assertive' ? setAssertiveMessage : setPoliteMessage
    const last = politeness === 'assertive' ? lastAssertive : lastPolite
    const now = Date.now()
    // Mismo mensaje repetido en una ventana corta → se ignora (evita que un
    // doble-render/doble-llamada dispare el mismo anuncio dos veces).
    if (last.current.message === message && now - last.current.at < DEDUPE_WINDOW_MS) return
    last.current = { message, at: now }
    // Vaciar y volver a escribir en el siguiente frame: si el mensaje es
    // idéntico al que ya está en la región, el DOM no cambia y el lector de
    // pantalla no vuelve a anunciarlo — este ciclo fuerza el re-anuncio.
    setMessage('')
    requestAnimationFrame(() => setMessage(message))
  }, [])

  return (
    <AnnouncementContext.Provider value={{ announce }}>
      {children}
      <div role="status" aria-live="polite" className="sr-only">{politeMessage}</div>
      <div role="alert" aria-live="assertive" className="sr-only">{assertiveMessage}</div>
    </AnnouncementContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAnnouncer() {
  const ctx = useContext(AnnouncementContext)
  if (!ctx) throw new Error('useAnnouncer debe usarse dentro de <AnnouncementProvider>')
  return ctx
}
