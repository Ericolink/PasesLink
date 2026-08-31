// Reemplaza la llamada directa del cliente a OpenRouteService/HeiGIT (ver
// ../lib/secrets.ts para el motivo: el proveedor no soporta restringir la
// key por dominio). Sin autenticación a propósito, mismo criterio que
// getOfferedWaitlistCount.ts — no expone datos sensibles, solo duración y
// distancia de una ruta entre dos puntos que el propio invitado mandó.
import { HttpsError, onCall } from 'firebase-functions/v2/https'
import { openRouteServiceApiKey } from '../lib/secrets.js'
import { fetchRouteEstimate, type Coordinates, type RouteEstimate } from '../travel/routeEstimate.js'
import { withCallableObservability } from '../lib/observability/withObservability.js'

interface EstimateTravelTimeInput {
  origin: Coordinates
  destination: Coordinates
}

function isCoordinates(value: unknown): value is Coordinates {
  const c = value as Coordinates | undefined
  return !!c && typeof c.lat === 'number' && typeof c.lng === 'number'
}

// timeoutSeconds:15 — un solo fetch a la API de directions de HeiGIT, mismo
// margen que assignWaitlistSpot.ts le da a una llamada HTTP externa comparable.
export const estimateTravelTime = onCall<EstimateTravelTimeInput>({ secrets: [openRouteServiceApiKey], timeoutSeconds: 15 }, (request) =>
  withCallableObservability(request, 'estimateTravelTime', async (ctx): Promise<RouteEstimate | null> => {
    const { origin, destination } = request.data || {}
    if (!isCoordinates(origin) || !isCoordinates(destination)) {
      throw new HttpsError('invalid-argument', 'Faltan las coordenadas de origen o destino.')
    }
    ctx.addContext({ origin, destination })

    return fetchRouteEstimate(openRouteServiceApiKey.value(), origin, destination)
  }),
)
