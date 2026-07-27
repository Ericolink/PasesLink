import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { useAnnouncer } from '../contexts/AnnouncementContext'

// Montado una sola vez en App.tsx, dentro de <BrowserRouter> — en cada
// cambio de ruta mueve el foco a <main id="main-content"> (PublicLayout/
// AppShell, los únicos 2 lugares que lo renderizan) y anuncia el nuevo
// título de página. Antes, navegar por <Link> dejaba el foco de teclado
// "flotando" en el link que se acaba de clickear (a veces ya desmontado) sin
// ningún aviso a lectores de pantalla de que la página cambió.
//
// El pequeño delay antes de leer document.title le da tiempo al
// useDocumentTitle propio de la página destino (efecto de un componente
// hermano, no un hijo de este) a correr primero — mismo compromiso práctico
// que usan otros "route announcer" conocidos (Reach Router/Next.js), no hay
// forma de garantizar el orden exacto entre efectos de componentes hermanos.
export function RouteAnnouncer() {
  const location = useLocation()
  const { announce } = useAnnouncer()
  // null hasta el primer efecto: guarda la ÚLTIMA ruta ya procesada, no un
  // simple flag de "primera vez". Un flag booleano no sobrevive el modo
  // StrictMode de desarrollo (main.tsx envuelve todo en <StrictMode>, que
  // invoca cada efecto dos veces al montar) — un flag se pone en `false` en
  // la primera invocación y ya no protege la segunda, así que el montaje
  // inicial terminaba moviendo el foco a <main> antes de cualquier
  // interacción real del usuario. Comparar contra la ruta previamente vista
  // sí es seguro: en las dos invocaciones de StrictMode `location.pathname`
  // es el mismo valor, así que la segunda también queda cubierta.
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    if (previousPath.current === null || previousPath.current === location.pathname) {
      previousPath.current = location.pathname
      return
    }
    previousPath.current = location.pathname
    const timeout = setTimeout(() => {
      document.getElementById('main-content')?.focus()
      announce(document.title)
    }, 100)
    return () => clearTimeout(timeout)
  }, [location.pathname, announce])

  return null
}
