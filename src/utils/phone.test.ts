import { describe, expect, it } from 'vitest'
import { toWhatsAppPhone } from './phone'

describe('toWhatsAppPhone', () => {
  it('produces the same digits-only, country-coded number regardless of input format', () => {
    const expected = '526561234567'
    expect(toWhatsAppPhone('6561234567')).toBe(expected)
    expect(toWhatsAppPhone('526561234567')).toBe(expected)
    expect(toWhatsAppPhone('+526561234567')).toBe(expected)
    expect(toWhatsAppPhone('+52 656 123 4567')).toBe(expected)
    expect(toWhatsAppPhone('656-123-4567')).toBe(expected)
  })

  it('strips spaces, parens and dashes', () => {
    expect(toWhatsAppPhone('(656) 123-4567')).toBe('526561234567')
  })

  it('does not duplicate the country code for an already-prefixed number', () => {
    expect(toWhatsAppPhone('+52 1 656 123 4567')).toBe('5216561234567')
  })

  it('returns an empty string for empty input', () => {
    expect(toWhatsAppPhone('')).toBe('')
  })
})
