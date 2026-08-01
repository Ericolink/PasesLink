import { describe, expect, it, vi } from 'vitest'

// remainingCapacity/assertCapacityAvailable son puras y no necesitan el
// emulador — pero el archivo igual importa `functions` de './config' a
// nivel de módulo (para fetchOfferedWaitlistCount, ver ese comentario ahí),
// así que hace falta el mismo mock que capacity.test.ts/guests.test.ts para
// no disparar la inicialización real del SDK de Firebase.
vi.mock('../config', () => ({ db: undefined, functions: undefined }))

import { assertCapacityAvailable, CapacityFullError, remainingCapacity } from '../attendeeLimit'

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
