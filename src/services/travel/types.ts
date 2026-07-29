import type { WeatherSnapshot } from '../../utils/weather'

export interface Coordinates {
  lat: number
  lng: number
}

export interface RouteEstimate {
  durationMinutes: number
  distanceKm: number
  // false en el proveedor de referencia (OpenRouteService free tier no da
  // tráfico en vivo) — la UI usa esto para aclarar "estimado sin tráfico en
  // vivo" en vez de prometer precisión que el proveedor no tiene.
  hasLiveTraffic: boolean
}

// Contrato mínimo para un proveedor de rutas — un proveedor nuevo (ej. Google
// Routes si algún día se evalúa Blaze) es un archivo nuevo en providers/ que
// implemente esta interfaz, sin tocar departureCalculator.ts ni el resto del
// sistema. null = "no se pudo estimar" (sin red, sin cuota, sin API key
// configurada) — nunca un número inventado, mismo criterio que ya usa
// src/utils/weather.ts.
export interface RouteProvider {
  id: string
  estimateTravelTime(origin: Coordinates, destination: Coordinates): Promise<RouteEstimate | null>
}

// Mismo contrato para clima — WeatherSnapshot ya existe (src/utils/weather.ts).
export interface WeatherProvider {
  id: string
  getForecast(coords: Coordinates, dateISO: string): Promise<WeatherSnapshot | null>
}
