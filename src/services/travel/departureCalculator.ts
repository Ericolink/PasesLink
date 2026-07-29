import type { WeatherSnapshot } from '../../utils/weather'
import { openMeteoProvider } from './providers/openMeteo'
import { openRouteServiceProvider } from './providers/openRouteService'
import type { Coordinates, RouteProvider, WeatherProvider } from './types'

export interface DepartureRecommendationInput {
  origin: Coordinates
  destination: Coordinates
  eventStartMs: number
  // 'YYYY-MM-DD' del evento, para el pronóstico — separado de eventStartMs
  // porque el clima se pide por día, no por hora exacta.
  eventDateISO: string
  bufferMinutes: number
  routeProvider?: RouteProvider
  weatherProvider?: WeatherProvider
}

export interface DepartureRecommendation {
  recommendedDepartureAtMs: number
  travelMinutes: number
  bufferMinutes: number
  distanceKm: number
  hasLiveTraffic: boolean
  // null = clima omitido (sin dato disponible) — degradación elegante, el
  // resto de la recomendación se muestra igual.
  weather: WeatherSnapshot | null
}

// null = no se pudo estimar la ruta — sin eso no hay recomendación posible,
// así que no se muestra nada (nunca un número inventado). El clima, en
// cambio, es prescindible: si falla, se omite solo esa parte.
export async function computeDepartureRecommendation(
  input: DepartureRecommendationInput,
): Promise<DepartureRecommendation | null> {
  const routeProvider = input.routeProvider ?? openRouteServiceProvider
  const weatherProvider = input.weatherProvider ?? openMeteoProvider

  const route = await routeProvider.estimateTravelTime(input.origin, input.destination)
  if (!route) return null

  const weather = await weatherProvider.getForecast(input.destination, input.eventDateISO)

  return {
    recommendedDepartureAtMs: input.eventStartMs - (route.durationMinutes + input.bufferMinutes) * 60_000,
    travelMinutes: route.durationMinutes,
    bufferMinutes: input.bufferMinutes,
    distanceKm: route.distanceKm,
    hasLiveTraffic: route.hasLiveTraffic,
    weather,
  }
}
