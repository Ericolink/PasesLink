import { httpsCallable } from 'firebase/functions'
import { functions } from '../../../firebase/config'
import { captureException } from '../../../lib/sentry'
import type { Coordinates, RouteEstimate, RouteProvider } from '../types'

// La llamada real a OpenRouteService/HeiGIT vive en la Cloud Function
// estimateTravelTime (functions/src/callable/estimateTravelTime.ts), no
// acá: OpenRouteService no ofrece restricción de key por dominio/referrer
// (limitación real del proveedor, sin resolver desde 2019 según su propio
// foro) — a diferencia de VITE_RECAPTCHA_SITE_KEY o VITE_FIREBASE_*, dejar
// esta key en el bundle del cliente significaría que cualquiera puede
// copiarla y agotar la cuota gratis de 2000 req/día. httpsCallable(functions,
// ...) se construye acá adentro (no a nivel de módulo) por el mismo motivo
// que fetchOfferedWaitlistCount en src/firebase/attendeeLimit.ts: importar
// este archivo no debe disparar la inicialización del SDK de Functions.
async function estimateTravelTime(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate | null> {
  const call = httpsCallable<{ origin: Coordinates; destination: Coordinates }, RouteEstimate | null>(functions, 'estimateTravelTime')
  try {
    const result = await call({ origin, destination })
    return result.data
  } catch (err) {
    captureException(err, { tags: { flow: 'openRouteService.estimateTravelTime' } })
    return null
  }
}

export const openRouteServiceProvider: RouteProvider = {
  id: 'openrouteservice',
  estimateTravelTime,
}
