import { describe, expect, it } from 'vitest'
import { toWhatsAppPhone } from './phone'

describe('toWhatsAppPhone', () => {
  it('preserves the country code when the number already has one', () => {
    expect(toWhatsAppPhone('+52 6561234567')).toBe('526561234567')
    expect(toWhatsAppPhone('526561234567')).toBe('526561234567')
    expect(toWhatsAppPhone('+1 9155551234')).toBe('19155551234')
    expect(toWhatsAppPhone('19155551234')).toBe('19155551234')
    expect(toWhatsAppPhone('+44 7700900123')).toBe('447700900123')
  })

  it('strips spaces, parens, dashes and the leading "+"', () => {
    expect(toWhatsAppPhone('+52 (656) 123-4567')).toBe('526561234567')
    expect(toWhatsAppPhone('656-123-4567')).toBe('526561234567')
  })

  it('falls back to the default country only for a bare local number with no country code', () => {
    expect(toWhatsAppPhone('6561234567')).toBe('526561234567')
  })

  it('accepts a different default country for numbers known to belong elsewhere', () => {
    expect(toWhatsAppPhone('9155551234', 'US')).toBe('19155551234')
  })

  it('returns an empty string for empty input', () => {
    expect(toWhatsAppPhone('')).toBe('')
    expect(toWhatsAppPhone('   ')).toBe('')
  })
})
