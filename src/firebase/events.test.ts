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

  // Regresión real (2026-07-31): se agregó `concessions?: ConcessionsConfig`
  // a EventData (módulo de venta de comida/bebida) y mapEvent nunca copiaba
  // ese campo del documento crudo al objeto que consume el resto de la app.
  // La escritura (enableConcessionsBeta) siempre funcionó — confirmable a
  // mano en la consola de Firebase — pero ningún componente
  // (ConcessionsSection, ConcessionsManager, el link "Menú" de EventDetail)
  // se enteraba nunca de que el campo existía, porque `event.concessions`
  // daba `undefined` sin importar lo que hubiera en Firestore. Los tests de
  // reglas de src/firebase/__tests__/concessions.rules.test.ts nunca lo
  // detectaron porque prueban lecturas/escrituras crudas contra el
  // emulador, sin pasar nunca por mapEvent.
  it('no incluye `concessions` cuando el documento no lo tiene (evento que nunca activó el módulo)', () => {
    const event = mapEvent('e1', baseData())
    expect(event.concessions).toBeUndefined()
  })

  it('copia `concessions` tal cual del documento de Firestore al EventData mapeado', () => {
    const concessions = {
      enabled: true,
      storeName: 'Barra de Baile Improvisado',
      currency: 'MXN',
      paymentMethods: ['transfer', 'cash'],
      useEventPaymentInstructions: true,
      concessionsStaffMap: {},
    }
    const event = mapEvent('e1', baseData({ concessions }))
    expect(event.concessions).toEqual(concessions)
    expect(event.concessions?.enabled).toBe(true)
  })
})
