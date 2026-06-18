import { describe, expect, it } from 'vitest'
import { extractQrToken, isArriveQr } from './qrUrl'

const EVENT_ID = 'evt123'

describe('extractQrToken', () => {
  it('extracts the token from a full pass URL', () => {
    const decoded = `https://paselink.app/pass/${EVENT_ID}/abc123token`
    expect(extractQrToken(decoded, EVENT_ID)).toBe('abc123token')
  })

  it('returns null for a raw token with no URL (the original EventJoin bug)', () => {
    // EventJoin alguna vez codificaba solo el qrToken crudo en el QR en vez de
    // la URL completa, y el scanner esperaba siempre una URL — por eso nunca
    // detectaba nada. Este caso documenta y previene esa regresión.
    expect(extractQrToken('abc123token', EVENT_ID)).toBeNull()
  })

  it('returns null when the token belongs to a different event', () => {
    const decoded = `https://paselink.app/pass/other-event/abc123token`
    expect(extractQrToken(decoded, EVENT_ID)).toBeNull()
  })

  it('returns null for a malformed URL', () => {
    expect(extractQrToken('not a url at all', EVENT_ID)).toBeNull()
  })
})

describe('isArriveQr', () => {
  it('recognizes the "ingreso directo" QR for the right event', () => {
    const decoded = `https://paselink.app/events/${EVENT_ID}/arrive`
    expect(isArriveQr(decoded, EVENT_ID)).toBe(true)
  })

  it('rejects an arrive QR from a different event', () => {
    const decoded = `https://paselink.app/events/other-event/arrive`
    expect(isArriveQr(decoded, EVENT_ID)).toBe(false)
  })

  it('rejects a pass URL (not an arrive URL)', () => {
    const decoded = `https://paselink.app/pass/${EVENT_ID}/abc123token`
    expect(isArriveQr(decoded, EVENT_ID)).toBe(false)
  })
})
