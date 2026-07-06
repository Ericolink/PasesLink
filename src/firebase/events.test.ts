import { describe, expect, it } from 'vitest'
import { mapEvent } from './events'

// mapEvent no toca Firestore (solo transforma el data crudo del doc) — no
// necesita el emulador, a diferencia de los tests en __tests__/, que sí.
describe('mapEvent', () => {
  function baseData(overrides: Record<string, unknown> = {}) {
    return {
      ownerId: 'owner-1',
      name: 'Evento',
      date: '2026-01-01',
      location: 'Salón',
      plan: 'premium',
      paymentStatus: 'paid',
      status: 'active',
      guestCount: 10,
      checkedInCount: 0,
      occupancyCount: 0,
      ...overrides,
    }
  }

  it('usa peopleCount tal cual cuando el documento ya lo tiene', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10, peopleCount: 25 }))
    expect(event.peopleCount).toBe(25)
  })

  it('eventos legacy sin peopleCount caen a guestCount, no a 0 (1 invitación = 1 persona)', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10 }))
    expect(event.peopleCount).toBe(10)
  })

  it('un evento legacy recién creado (guestCount 0) sigue dando peopleCount 0', () => {
    const event = mapEvent('e1', baseData({ guestCount: 0 }))
    expect(event.peopleCount).toBe(0)
  })

  it('respeta peopleCount == 0 explícito sin confundirlo con "campo ausente"', () => {
    const event = mapEvent('e1', baseData({ guestCount: 10, peopleCount: 0 }))
    expect(event.peopleCount).toBe(0)
  })
})
