import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { trackAppOpened, trackScreenView } from '../lib/analytics'

// Montado una sola vez en App.tsx, junto a RouteAnnouncer. `previousPath`
// (no un flag booleano) por el mismo motivo que ese componente: sobrevive el
// doble efecto de <StrictMode> en desarrollo sin registrar dos veces la
// misma pantalla — ver el comentario largo en RouteAnnouncer.tsx. A
// diferencia de RouteAnnouncer, acá SÍ interesa registrar la primera
// pantalla (es la apertura de la app), por eso el chequeo es distinto: solo
// se descarta la segunda invocación de StrictMode (mismo pathname que la
// anterior), nunca la primera.
export function AnalyticsRouteTracker() {
  const location = useLocation()
  const previousPath = useRef<string | null>(null)

  useEffect(() => {
    if (previousPath.current === location.pathname) return
    const isFirstScreen = previousPath.current === null
    previousPath.current = location.pathname
    if (isFirstScreen) trackAppOpened()
    trackScreenView(location.pathname)
  }, [location.pathname])

  return null
}
