import { describe, expect, it } from 'vitest'
import { classifySentryHealth } from './sentryHealth.js'

describe('classifySentryHealth', () => {
  it('is "ok" with zero unresolved issues', () => {
    expect(classifySentryHealth(0, false)).toBe('ok')
  })

  it('is "warning" with 1-9 unresolved issues', () => {
    expect(classifySentryHealth(1, false)).toBe('warning')
    expect(classifySentryHealth(9, false)).toBe('warning')
  })

  it('is "error" with 10+ unresolved issues', () => {
    expect(classifySentryHealth(10, false)).toBe('error')
  })

  it('is "error" when there are more than the page fetched, regardless of count', () => {
    expect(classifySentryHealth(3, true)).toBe('error')
  })
})
