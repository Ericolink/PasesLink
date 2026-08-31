import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRouteEstimate } from './routeEstimate.js'

const ORIGIN = { lat: 19.4326, lng: -99.1332 }
const DESTINATION = { lat: 19.427, lng: -99.168 }

describe('fetchRouteEstimate', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns null without an api key, never calling fetch', async () => {
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const result = await fetchRouteEstimate('', ORIGIN, DESTINATION)

    expect(result).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('maps a successful directions response to duration/distance', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ features: [{ properties: { summary: { duration: 754, distance: 8234 } } }] }),
    }))

    const result = await fetchRouteEstimate('test-key', ORIGIN, DESTINATION)

    expect(result).toEqual({ durationMinutes: 13, distanceKm: 8.2, hasLiveTraffic: false })
  })

  it('returns null on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))

    const result = await fetchRouteEstimate('test-key', ORIGIN, DESTINATION)

    expect(result).toBeNull()
  })

  it('returns null when the response has no route summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ features: [] }) }))

    const result = await fetchRouteEstimate('test-key', ORIGIN, DESTINATION)

    expect(result).toBeNull()
  })

  it('returns null instead of throwing on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    const result = await fetchRouteEstimate('test-key', ORIGIN, DESTINATION)

    expect(result).toBeNull()
  })
})
