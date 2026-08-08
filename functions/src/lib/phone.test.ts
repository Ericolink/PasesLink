import { describe, expect, it } from 'vitest'
import { isValidWhatsAppPhone, redactPhone } from './phone.js'

// toWhatsAppPhone en sí es un puerto exacto de src/utils/phone.ts (ya
// cubierto por src/utils/phone.test.ts) — acá solo se cubre lo nuevo de
// este archivo: la validación estricta y la redacción para sendLog.
describe('isValidWhatsAppPhone', () => {
  it('accepts a valid number with explicit country code', () => {
    expect(isValidWhatsAppPhone('+52 55 1234 5678')).toBe(true)
  })

  it('accepts a valid local number given a default country', () => {
    expect(isValidWhatsAppPhone('5512345678', 'MX')).toBe(true)
  })

  it('rejects garbage input', () => {
    expect(isValidWhatsAppPhone('not-a-phone')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(isValidWhatsAppPhone('')).toBe(false)
  })

  it('rejects a too-short number that only survives the "strip non-digits" fallback', () => {
    expect(isValidWhatsAppPhone('123')).toBe(false)
  })
})

describe('redactPhone', () => {
  it('keeps only the last 4 digits', () => {
    expect(redactPhone('525512345678')).toBe('***5678')
  })

  it('falls back to a fixed placeholder for very short input', () => {
    expect(redactPhone('12')).toBe('***')
  })
})
