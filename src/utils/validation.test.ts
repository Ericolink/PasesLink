import { describe, expect, it } from 'vitest'
import { requireMaxLength, requireNonEmpty } from './validation'

describe('requireNonEmpty', () => {
  it('returns the trimmed value when non-empty', () => {
    expect(requireNonEmpty('  Ana  ', 'El nombre')).toBe('Ana')
  })

  it('throws with a clear message for empty or whitespace-only input', () => {
    expect(() => requireNonEmpty('', 'El nombre')).toThrow('El nombre es obligatorio.')
    expect(() => requireNonEmpty('   ', 'El nombre')).toThrow('El nombre es obligatorio.')
  })
})

describe('requireMaxLength', () => {
  it('returns the value when within the limit', () => {
    expect(requireMaxLength('hola', 10, 'El mensaje')).toBe('hola')
  })

  it('throws with a clear message when the limit is exceeded', () => {
    expect(() => requireMaxLength('a'.repeat(11), 10, 'El mensaje')).toThrow(
      'El mensaje no puede superar los 10 caracteres.',
    )
  })

  it('allows a value exactly at the limit', () => {
    expect(requireMaxLength('a'.repeat(10), 10, 'El mensaje')).toBe('a'.repeat(10))
  })
})
