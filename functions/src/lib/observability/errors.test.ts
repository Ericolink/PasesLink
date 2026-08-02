import { describe, expect, it } from 'vitest'
import { HttpsError } from 'firebase-functions/v2/https'
import { isExpectedError, toSafeHttpsError } from './errors.js'

describe('isExpectedError', () => {
  it('reconoce códigos de regla de negocio como esperados', () => {
    expect(isExpectedError(new HttpsError('invalid-argument', 'x'))).toBe(true)
    expect(isExpectedError(new HttpsError('not-found', 'x'))).toBe(true)
    expect(isExpectedError(new HttpsError('permission-denied', 'x'))).toBe(true)
    expect(isExpectedError(new HttpsError('failed-precondition', 'x'))).toBe(true)
  })

  it('no reconoce códigos de infraestructura como esperados', () => {
    expect(isExpectedError(new HttpsError('internal', 'x'))).toBe(false)
    expect(isExpectedError(new HttpsError('unavailable', 'x'))).toBe(false)
  })

  it('no reconoce errores genéricos como esperados', () => {
    expect(isExpectedError(new Error('boom'))).toBe(false)
    expect(isExpectedError('boom')).toBe(false)
  })
})

describe('toSafeHttpsError', () => {
  it('devuelve un HttpsError esperado sin modificar', () => {
    const err = new HttpsError('not-found', 'El evento no existe.')
    expect(toSafeHttpsError(err)).toBe(err)
  })

  it('convierte un error genérico en un HttpsError(internal) con mensaje seguro', () => {
    const result = toSafeHttpsError(new TypeError('cannot read property of undefined'))
    expect(result).toBeInstanceOf(HttpsError)
    expect(result.code).toBe('internal')
    expect(result.message).not.toContain('cannot read property')
  })

  it('convierte un HttpsError de infraestructura en un mensaje genérico', () => {
    const result = toSafeHttpsError(new HttpsError('unavailable', 'detalle interno sensible'))
    expect(result.code).toBe('internal')
    expect(result.message).not.toContain('detalle interno sensible')
  })
})
