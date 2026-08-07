import { describe, expect, it } from 'vitest'
import { parseUserAgent } from './parseUserAgent'

describe('parseUserAgent', () => {
  it('detects Android + Chrome', () => {
    const ua =
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36'
    expect(parseUserAgent(ua)).toEqual({ os: 'android', browser: 'chrome' })
  })

  it('detects iPhone + Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    expect(parseUserAgent(ua)).toEqual({ os: 'ios', browser: 'safari' })
  })

  it('detects iPhone + Chrome (CriOS)', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.6422.80 Mobile/15E148 Safari/604.1'
    expect(parseUserAgent(ua)).toEqual({ os: 'ios', browser: 'chrome' })
  })

  it('detects Windows + Edge', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0'
    expect(parseUserAgent(ua)).toEqual({ os: 'windows', browser: 'edge' })
  })

  it('detects Windows + Chrome', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
    expect(parseUserAgent(ua)).toEqual({ os: 'windows', browser: 'chrome' })
  })

  it('detects macOS + Safari', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
    expect(parseUserAgent(ua)).toEqual({ os: 'mac', browser: 'safari' })
  })

  it('detects Linux + Firefox', () => {
    const ua = 'Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0'
    expect(parseUserAgent(ua)).toEqual({ os: 'linux', browser: 'firefox' })
  })

  it('falls back to "other"/"other" for an unrecognized user agent, without crashing', () => {
    expect(parseUserAgent('SomeWeirdBot/1.0')).toEqual({ os: 'other', browser: 'other' })
  })

  it('handles an empty user agent', () => {
    expect(parseUserAgent('')).toEqual({ os: 'other', browser: 'other' })
  })
})
