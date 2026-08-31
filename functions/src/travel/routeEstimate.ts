// Lógica pura de estimateTravelTime.ts (Callable) — separada para poder
// testearla sin pasar por firebase-functions/params. Es el mismo fetch que
// antes vivía en src/services/travel/providers/openRouteService.ts
// (cliente): se movió acá porque OpenRouteService no ofrece restricción de
// key por dominio/referrer (limitación real del proveedor, confirmada en su
// foro — ver comentario en ../lib/secrets.ts), así que la key ya no puede
// viajar en el bundle. Mismo criterio de "nunca inventar un número" que
// src/utils/weather.ts: cualquier falla (red, cuota, key vacía, respuesta
// sin ruta) devuelve null, nunca lanza.
export interface Coordinates {
  lat: number
  lng: number
}

export interface RouteEstimate {
  durationMinutes: number
  distanceKm: number
  hasLiveTraffic: boolean
}

// api.openrouteservice.org está deprecada desde el 28 abr 2026 a favor de
// api.heigit.org (estructura unificada de APIs de HeiGIT: se inserta
// "/openrouteservice/" entre el dominio y la versión) — se apaga del todo
// el 28 sep 2026.
const DIRECTIONS_URL = 'https://api.heigit.org/openrouteservice/v2/directions/driving-car'

interface DirectionsResponse {
  features?: { properties?: { summary?: { duration?: number; distance?: number } } }[]
}

export async function fetchRouteEstimate(apiKey: string, origin: Coordinates, destination: Coordinates): Promise<RouteEstimate | null> {
  if (!apiKey) return null

  try {
    const url = `${DIRECTIONS_URL}?api_key=${apiKey}&start=${origin.lng},${origin.lat}&end=${destination.lng},${destination.lat}`
    const response = await fetch(url)
    if (!response.ok) return null
    const data = (await response.json()) as DirectionsResponse
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
