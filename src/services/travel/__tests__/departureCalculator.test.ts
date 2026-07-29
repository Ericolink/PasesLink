import { describe, expect, it } from 'vitest'
import { computeDepartureRecommendation } from '../departureCalculator'
import type { RouteProvider, WeatherProvider } from '../types'

const ORIGIN = { lat: 19.43, lng: -99.13 }
const DESTINATION = { lat: 19.5, lng: -99.2 }
const EVENT_START_MS = new Date('2026-08-01T20:00:00').getTime()

function stubRouteProvider(estimate: Awaited<ReturnType<RouteProvider['estimateTravelTime']>>): RouteProvider {
  return { id: 'stub-route', estimateTravelTime: async () => estimate }
}

function stubWeatherProvider(forecast: Awaited<ReturnType<WeatherProvider['getForecast']>>): WeatherProvider {
  return { id: 'stub-weather', getForecast: async () => forecast }
}

describe('computeDepartureRecommendation', () => {
  it('recommends a departure time that accounts for travel time and buffer', async () => {
    const result = await computeDepartureRecommendation({
      origin: ORIGIN,
      destination: DESTINATION,
      eventStartMs: EVENT_START_MS,
      eventDateISO: '2026-08-01',
      bufferMinutes: 15,
      routeProvider: stubRouteProvider({ durationMinutes: 40, distanceKm: 22.5, hasLiveTraffic: false }),
      weatherProvider: stubWeatherProvider({ tempMaxC: 24, tempMinC: 14, conditionLabel: 'Despejado', icon: '☀️' }),
    })

    expect(result).not.toBeNull()
    expect(result!.travelMinutes).toBe(40)
    expect(result!.recommendedDepartureAtMs).toBe(EVENT_START_MS - 55 * 60_000)
    expect(result!.weather?.conditionLabel).toBe('Despejado')
    expect(result!.hasLiveTraffic).toBe(false)
  })

  it('degrades gracefully when weather is unavailable, still recommending a departure time', async () => {
    const result = await computeDepartureRecommendation({
      origin: ORIGIN,
      destination: DESTINATION,
      eventStartMs: EVENT_START_MS,
      eventDateISO: '2026-08-01',
      bufferMinutes: 15,
      routeProvider: stubRouteProvider({ durationMinutes: 30, distanceKm: 18, hasLiveTraffic: false }),
      weatherProvider: stubWeatherProvider(null),
    })

    expect(result).not.toBeNull()
    expect(result!.weather).toBeNull()
    expect(result!.recommendedDepartureAtMs).toBe(EVENT_START_MS - 45 * 60_000)
  })

  it('returns null when the route cannot be estimated (no fabricated travel time)', async () => {
    const result = await computeDepartureRecommendation({
      origin: ORIGIN,
      destination: DESTINATION,
      eventStartMs: EVENT_START_MS,
      eventDateISO: '2026-08-01',
      bufferMinutes: 15,
      routeProvider: stubRouteProvider(null),
      weatherProvider: stubWeatherProvider({ tempMaxC: 24, tempMinC: 14, conditionLabel: 'Despejado', icon: '☀️' }),
    })

    expect(result).toBeNull()
  })

  it('respects a custom buffer margin', async () => {
    const result = await computeDepartureRecommendation({
      origin: ORIGIN,
      destination: DESTINATION,
      eventStartMs: EVENT_START_MS,
      eventDateISO: '2026-08-01',
      bufferMinutes: 30,
      routeProvider: stubRouteProvider({ durationMinutes: 20, distanceKm: 10, hasLiveTraffic: true }),
      weatherProvider: stubWeatherProvider(null),
    })

    expect(result!.recommendedDepartureAtMs).toBe(EVENT_START_MS - 50 * 60_000)
    expect(result!.hasLiveTraffic).toBe(true)
  })
})
