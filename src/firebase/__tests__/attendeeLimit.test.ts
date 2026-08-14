import { describe, expect, it, vi } from 'vitest'

// remainingCapacity/assertCapacityAvailable son puras y no necesitan el
// emulador — pero el archivo igual importa `functions` de './config' a
// nivel de módulo (para fetchOfferedWaitlistCount, ver ese comentario ahí),
// así que hace falta el mismo mock que capacity.test.ts/guests.test.ts para
// no disparar la inicialización real del SDK de Firebase.
vi.mock('../config', () => ({ db: undefined, functions: undefined }))

import { assertCapacityAvailable, capacityReductionAllowed, CapacityFullError, remainingCapacity } from '../attendeeLimit'

describe('remainingCapacity/assertCapacityAvailable — offeredCount', () => {
  it('returns null (cupo ilimitado) regardless of offeredCount when the limit is disabled', () => {
    expect(remainingCapacity({ attendeeLimitEnabled: false, capacity: 10, peopleCount: 5 }, 3)).toBeNull()
  })

  it('subtracts offeredCount from the naive remaining', () => {
    expect(remainingCapacity({ attendeeLimitEnabled: true, capacity: 10, peopleCount: 8 }, 2)).toBe(0)
  })

  it('never goes negative even if offeredCount alone exceeds what peopleCount leaves', () => {
    expect(remainingCapacity({ attendeeLimitEnabled: true, capacity: 10, peopleCount: 8 }, 5)).toBe(0)
  })

  it('defaults offeredCount to 0 — same behavior as before this parameter existed', () => {
    expect(remainingCapacity({ attendeeLimitEnabled: true, capacity: 10, peopleCount: 8 })).toBe(2)
  })

  it('rejects an addition that only fits ignoring outstanding waitlist offers', () => {
    // El caso real que motivó el fix (§7 de WAITLIST_RECONFIRMATION_ARCHITECTURE.md):
    // 1 lugar libre por peopleCount, pero ya hay una oferta activa de 1
    // persona reservándolo — un alta manual de 1 persona más no debería entrar.
    expect(() =>
      assertCapacityAvailable({ attendeeLimitEnabled: true, capacity: 10, peopleCount: 9 }, 1, 1),
    ).toThrow(CapacityFullError)
  })

  it('allows an addition that fits once outstanding offers are accounted for', () => {
    expect(() =>
      assertCapacityAvailable({ attendeeLimitEnabled: true, capacity: 10, peopleCount: 7 }, 1, 2),
    ).not.toThrow()
  })
})

describe('capacityReductionAllowed', () => {
  it('always allows turning the limit off, regardless of capacity/peopleCount', () => {
    expect(capacityReductionAllowed({ attendeeLimitEnabled: true, capacity: 300, peopleCount: 280 }, 200, false)).toBe(true)
  })

  it('allows any capacity that still fits everyone already confirmed', () => {
    expect(capacityReductionAllowed({ attendeeLimitEnabled: true, capacity: 300, peopleCount: 280 }, 280, true)).toBe(true)
  })

  it('rejects reducing capacity below the people already confirmed (spec §17)', () => {
    // Capacidad: 300, personas confirmadas: 280, el organizador intenta 300 → 200.
    expect(capacityReductionAllowed({ attendeeLimitEnabled: true, capacity: 300, peopleCount: 280 }, 200, true)).toBe(false)
  })

  it('allows raising capacity even if it still falls short of peopleCount — progress is not a reduction', () => {
    // 200 → 250 con 280 confirmados: sigue sin alcanzar, pero no es un empeoramiento.
    expect(capacityReductionAllowed({ attendeeLimitEnabled: true, capacity: 200, peopleCount: 280 }, 250, true)).toBe(true)
  })

  it('allows re-saving an inherited over-capacity event untouched (grandfather clause)', () => {
    // capacity/attendeeLimitEnabled no cambian en este guardado — no es una
    // reducción nueva, solo un estado heredado de antes de este guard.
    expect(capacityReductionAllowed({ attendeeLimitEnabled: true, capacity: 200, peopleCount: 220 }, 200, true)).toBe(true)
  })

  it('rejects turning the limit on for the first time with a capacity already below peopleCount', () => {
    // El límite nunca estuvo activo (capacity era solo informativo); activarlo
    // ahora con un número insuficiente crea la inconsistencia recién ahora.
    expect(capacityReductionAllowed({ attendeeLimitEnabled: false, capacity: 200, peopleCount: 220 }, 200, true)).toBe(false)
  })
})
