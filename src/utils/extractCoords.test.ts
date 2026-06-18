import { describe, expect, it } from 'vitest'
import { extractCoords } from './extractCoords'

describe('extractCoords', () => {
  it('extracts lat/lng from a full Google Maps URL with @lat,lng', () => {
    const url = 'https://www.google.com/maps/place/Restaurant/@19.432608,-99.133209,15z/data=...'
    expect(extractCoords(url)).toEqual({ lat: 19.432608, lng: -99.133209 })
  })

  it('extracts lat/lng from a maps embed URL with ?q=lat,lng', () => {
    const url = 'https://maps.google.com/maps?q=19.432608,-99.133209&output=embed'
    expect(extractCoords(url)).toEqual({ lat: 19.432608, lng: -99.133209 })
  })

  it('returns null when the URL has no extractable coordinates (e.g. a place name)', () => {
    // Esto es justamente el bug que mandaba a un usuario a un desierto en España:
    // un link de Maps sin @lat,lng no debe geocodificarse, debe ignorarse.
    const url = 'https://maps.google.com/maps?q=Restaurante+El+Buen+Sabor'
    expect(extractCoords(url)).toBeNull()
  })

  it('returns null for an empty string', () => {
    expect(extractCoords('')).toBeNull()
  })
})
