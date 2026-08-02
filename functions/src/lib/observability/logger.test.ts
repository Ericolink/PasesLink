import { describe, expect, it, vi, beforeEach } from 'vitest'

const writeMock = vi.fn()
vi.mock('firebase-functions/logger', () => ({
  logger: { write: writeMock },
}))

const { createRequestContext } = await import('./context.js')
const { createLogger } = await import('./logger.js')

describe('createLogger', () => {
  beforeEach(() => {
    writeMock.mockReset()
  })

  it('incluye requestId, functionName y severidad en cada entrada', () => {
    const ctx = createRequestContext('testFn')
    createLogger(ctx).info('hola')
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'INFO',
      message: 'hola',
      requestId: ctx.requestId,
      functionName: 'testFn',
    }))
  })

  it('acumula los campos agregados con ctx.addContext en logs posteriores', () => {
    const ctx = createRequestContext('testFn')
    ctx.addContext({ eventId: 'evt-1', guestId: 'guest-1' })
    createLogger(ctx).warn('cuidado')
    expect(writeMock).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'WARNING',
      eventId: 'evt-1',
      guestId: 'guest-1',
    }))
  })

  it('serializa instancias de Error en vez de perderlas en JSON', () => {
    const ctx = createRequestContext('testFn')
    createLogger(ctx).error('algo falló', { error: new Error('boom') })
    const entry = writeMock.mock.calls[0][0]
    expect(entry.error).toEqual(expect.objectContaining({ name: 'Error', message: 'boom', stack: expect.any(String) }))
  })
})
