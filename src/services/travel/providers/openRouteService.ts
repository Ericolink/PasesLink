import { cleanEnv } from '../../../utils/env'
import type { Coordinates, RouteEstimate, RouteProvider } from '../types'

const API_KEY = cleanEnv(import.meta.env.VITE_OPENROUTESERVICE_API_KEY)

// La key es client-side y compartida por todos los usuarios de la PWA (Spark,
// sin backend para ocultarla) — se restringe por dominio en el dashboard de
// OpenRouteService. Free tier: 2000 req/día sin tráfico en vivo. Sin key
// configurada, o ante cualquier error/cuota agotada, se devuelve null (nunca
// un tiempo de viaje inventado) — mismo criterio que src/utils/weather.ts.
async function estimateTravelTime(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate | null> {
  if (!API_KEY) return null

  try {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${API_KEY}&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = await response.json()
    const summary = data?.features?.[0]?.properties?.summary
    const durationSec = summary?.duration
    const distanceM = summary?.distance
    if (typeof durationSec !== 'number' || typeof distanceM !== 'number') return null
    return {
      durationMinutes: Math.round(durationSec / 60),
      distanceKm: Math.round((distanceM / 1000) * 10) / 10,
      hasLiveTraffic: false,
    }
  } catch {
    return null
  }
}

export const openRouteServiceProvider: RouteProvider = {
  id: 'openrouteservice',
  estimateTravelTime,
}
