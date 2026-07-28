import { useEffect, useState } from 'react'
import type { EventData } from '../types'
import { extractCoords } from '../utils/extractCoords'
import { fetchWeatherForecast, type WeatherSnapshot } from '../utils/weather'

const CACHE_TTL_MS = 60 * 60 * 1000 // 60 min — el clima no necesita más frescura que esto

interface CachedWeather {
  snapshot: WeatherSnapshot
  fetchedAt: number
}

function cacheKey(eventId: string, dateISO: string): string {
  return `weather_${eventId}_${dateISO}`
}

function readCache(key: string): WeatherSnapshot | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const cached: CachedWeather = JSON.parse(raw)
    if (Date.now() - cached.fetchedAt > CACHE_TTL_MS) return null
    return cached.snapshot
  } catch {
    return null
  }
}

function writeCache(key: string, snapshot: WeatherSnapshot): void {
  try {
    const entry: CachedWeather = { snapshot, fetchedAt: Date.now() }
    localStorage.setItem(key, JSON.stringify(entry))
  } catch {
    // localStorage lleno/deshabilitado — el widget simplemente vuelve a
    // pedir el pronóstico en la próxima carga, sin romper nada.
  }
}

// null = "no hay clima que mostrar" (sin mapsUrl parseable, fecha fuera de
// horizonte, o error de red) — EventWeather.tsx no distingue estos casos,
// todos se resuelven en silencio (ver justificación en weather.ts).
export function useEventWeather(event: EventData): WeatherSnapshot | null {
  const [snapshot, setSnapshot] = useState<WeatherSnapshot | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const coords = event.mapsUrl ? extractCoords(event.mapsUrl) : null
    if (!coords) {
      setSnapshot(null)
      return
    }

    const key = cacheKey(event.id, event.date)
    const cached = readCache(key)
    if (cached) {
      setSnapshot(cached)
      return
    }

    let cancelled = false
    fetchWeatherForecast(coords.lat, coords.lng, event.date).then((result) => {
      if (cancelled) return
      if (result) writeCache(key, result)
      setSnapshot(result)
    })
    return () => {
      cancelled = true
    }
  }, [event.id, event.date, event.mapsUrl])
  /* eslint-enable react-hooks/set-state-in-effect */

  return snapshot
}
