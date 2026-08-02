import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { HttpsError, type CallableRequest } from 'firebase-functions/v2/https'

const writeMock = vi.fn()
vi.mock('firebase-functions/logger', () => ({
  logger: { write: writeMock },
}))

const { withCallableObservability, withScheduledObservability, withTriggerObservability } = await import('./withObservability.js')

function severities(): string[] {
  return writeMock.mock.calls.map((call) => call[0].severity)
}

function fields(index: number): Record<string, unknown> {
  return writeMock.mock.calls[index][0]
}

describe('withCallableObservability', () => {
  beforeEach(() => {
    writeMock.mockReset()
  })

  it('devuelve el resultado del handler y loguea inicio + éxito', async () => {
    const request = { data: {}, auth: { uid: 'user-1' } } as unknown as CallableRequest<unknown>
    const result = await withCallableObservability(request, 'myFn', async () => ({ ok: true }))
    expect(result).toEqual({ ok: true })
    expect(severities()).toEqual(['INFO', 'INFO'])
    expect(fields(1)).toEqual(expect.objectContaining({ uid: 'user-1', functionName: 'myFn', durationMs: expect.any(Number) }))
  })

  it('permite agregar contexto (eventId/guestId) desde el handler', async () => {
    const request = { data: {}, auth: { uid: 'user-1' } } as unknown as CallableRequest<unknown>
    await withCallableObservability(request, 'myFn', async (ctx) => {
      ctx.addContext({ eventId: 'evt-1', guestId: 'guest-1' })
      return { ok: true }
    })
    expect(fields(1)).toEqual(expect.objectContaining({ eventId: 'evt-1', guestId: 'guest-1' }))
  })

  it('errores esperados (HttpsError de negocio) se loguean en WARNING y se re-lanzan sin cambios', async () => {
    const request = { data: {} } as unknown as CallableRequest<unknown>
    const original = new HttpsError('not-found', 'El evento no existe.')
    await expect(withCallableObservability(request, 'myFn', async () => {
      throw original
    })).rejects.toBe(original)
    expect(severities()).toEqual(['INFO', 'WARNING'])
  })

  it('errores inesperados se loguean en ERROR y se re-lanzan como HttpsError(internal) seguro', async () => {
    const request = { data: {} } as unknown as CallableRequest<unknown>
    await expect(withCallableObservability(request, 'myFn', async () => {
      throw new TypeError('detalle interno sensible')
    })).rejects.toMatchObject({ code: 'internal' })
    expect(severities()).toEqual(['INFO', 'ERROR'])
    expect(fields(1).error).toEqual(expect.objectContaining({ message: 'detalle interno sensible' }))
  })
})

describe('withScheduledObservability', () => {
  beforeEach(() => {
    writeMock.mockReset()
  })

  it('ejecuta el handler y loguea inicio + éxito sin uid', async () => {
    await withScheduledObservability('myScheduled', async () => {})
    expect(severities()).toEqual(['INFO', 'INFO'])
    expect(fields(0).uid).toBeUndefined()
  })

  it('re-lanza el error original sin convertirlo (no hay cliente esperando HttpsError)', async () => {
    const original = new Error('barrido falló')
    await expect(withScheduledObservability('myScheduled', async () => {
      throw original
    })).rejects.toBe(original)
    expect(severities()).toEqual(['INFO', 'ERROR'])
  })
})

describe('withTriggerObservability', () => {
  beforeEach(() => {
    writeMock.mockReset()
  })

  it('agrega los params del evento al contexto automáticamente', async () => {
    const event = { params: { eventId: 'evt-1' } }
    await withTriggerObservability(event, 'myTrigger', async () => {})
    expect(fields(0)).toEqual(expect.objectContaining({ eventId: 'evt-1' }))
    expect(fields(1)).toEqual(expect.objectContaining({ eventId: 'evt-1' }))
  })
})

describe('advertencia de operación lenta', () => {
  beforeEach(() => {
    writeMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('loguea una advertencia WARNING adicional cuando la duración supera 1000ms', async () => {
    const request = { data: {} } as unknown as CallableRequest<unknown>
    await withCallableObservability(request, 'slowFn', async () => {
      vi.advanceTimersByTime(1500)
      return { ok: true }
    })
    expect(severities()).toEqual(['INFO', 'INFO', 'WARNING'])
    expect(fields(2)).toEqual(expect.objectContaining({ slowOperation: true }))
  })
})
