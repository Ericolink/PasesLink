import { useCallback, useMemo, useState } from 'react'
import { computeDepartureRecommendation } from '../services/travel/departureCalculator'
import type { Coordinates } from '../services/travel/types'
import type { EventData } from '../types'
import { extractCoords } from '../utils/extractCoords'
import type { WeatherSnapshot } from '../utils/weather'

const CACHE_TTL_MS = 60 * 60 * 1000 // mismo TTL que useEventWeather — el tráfico/clima no necesitan más frescura
const DEFAULT_BUFFER_MINUTES = 15

interface RouteBase {
  travelMinutes: number
  distanceKm: number
  hasLiveTraffic: boolean
  weather: WeatherSnapshot | null
}

interface CachedRoute {
  base: RouteBase
  fetchedAt: number
}

// Redondeado a ~1km de precisión: evita invalidar el cache por el jitter
// normal del GPS entre una consulta y la siguiente del mismo invitado.
function cacheKey(eventId: string, dateISO: string, origin: Coordinates): string {
  return `departure_${eventId}_${dateISO}_${origin.lat.toFixed(2)}_${origin.lng.toFixed(2)}`
}

function readCache(key: string): RouteBase | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const cached: CachedRoute = JSON.parse(raw)
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null
    return cached.base
  } catch {
    return null
  }
}

function writeCache(key: string, base: RouteBase): void {
  try {
    localStorage.setItem(key, JSON.stringify({ base, fetchedAt: Date.now() } satisfies CachedRoute))
  } catch {
    // localStorage lleno/deshabilitado — se vuelve a pedir en el próximo cálculo, sin romper nada.
  }
}

// A diferencia de compareEventsByRelevance/eventDateTimeMs (utils/time.ts),
// acá NO se asume 00:00 cuando falta la hora — sin hora de inicio real, no
// hay una hora de salida que recomendar, así que se degrada a "no disponible".
function getEventStartMs(date: string, startTime: string | undefined): number | null {
  if (!startTime || !/^\d{2}:\d{2}$/.test(startTime)) return null
  const ms = new Date(`${date}T${startTime}:00`).getTime()
  return Number.isNaN(ms) ? null : ms
}

export type DepartureReminderState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; base: RouteBase }

export interface DepartureReminderResult {
  state: DepartureReminderState
  available: boolean
  bufferMinutes: number
  setBufferMinutes: (minutes: number) => void
  eventStartMs: number | null
  calculate: () => void
}

// El cálculo es on-demand (gatillado por un botón, nunca automático): pedir
// geolocalización del navegador requiere un gesto explícito del usuario.
export function useDepartureReminder(event: EventData): DepartureReminderResult {
  const [state, setState] = useState<DepartureReminderState>({ status: 'idle' })
  const [bufferMinutes, setBufferMinutes] = useState(event.departureReminderBufferMinutes ?? DEFAULT_BUFFER_MINUTES)

  const destination = useMemo(() => (event.mapsUrl ? extractCoords(event.mapsUrl) : null), [event.mapsUrl])
  const eventStartMs = useMemo(() => getEventStartMs(event.date, event.startTime), [event.date, event.startTime])
  const available = !!destination && eventStartMs !== null && typeof navigator !== 'undefined' && 'geolocation' in navigator

  const calculate = useCallback(() => {
    if (!destination || eventStartMs === null || !('geolocation' in navigator)) {
      setState({ status: 'unavailable' })
      return
    }

    setState({ status: 'loading' })
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const origin: Coordinates = { lat: position.coords.latitude, lng: position.coords.longitude }
        const key = cacheKey(event.id, event.date, origin)
        const cached = readCache(key)
        if (cached) {
          setState({ status: 'ready', base: cached })
          return
        }

        // bufferMinutes:0 acá a propósito — el margen se suma en la UI a
        // partir de travelMinutes, así ajustar el stepper +/- no dispara un
        // nuevo cálculo de red.
        const recommendation = await computeDepartureRecommendation({
          origin,
          destination,
          eventStartMs,
          eventDateISO: event.date,
          bufferMinutes: 0,
        })
        if (!recommendation) {
          setState({ status: 'error', message: 'No pudimos calcular tu ruta ahora. Prueba de nuevo en un momento.' })
          return
        }

        const base: RouteBase = {
          travelMinutes: recommendation.travelMinutes,
          distanceKm: recommendation.distanceKm,
          hasLiveTraffic: recommendation.hasLiveTraffic,
          weather: recommendation.weather,
        }
        writeCache(key, base)
        setState({ status: 'ready', base })
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Necesitamos tu ubicación para calcular tu hora de salida.'
            : 'No pudimos obtener tu ubicación ahora.'
        setState({ status: 'error', message })
      },
      { timeout: 10_000, maximumAge: 5 * 60_000 },
    )
  }, [destination, eventStartMs, event.id, event.date])

  return { state, available, bufferMinutes, setBufferMinutes, eventStartMs, calculate }
}
