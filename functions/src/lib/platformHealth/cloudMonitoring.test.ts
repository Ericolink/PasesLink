import { describe, expect, it } from 'vitest'
import { classifyFunctionsHealth } from './cloudMonitoring.js'

describe('classifyFunctionsHealth', () => {
  it('is "unknown" with zero executions in the window (nothing ran, not necessarily healthy)', () => {
    expect(classifyFunctionsHealth(0, 0)).toBe('unknown')
  })

  it('is "ok" under 1% error rate', () => {
    expect(classifyFunctionsHealth(1000, 0.5)).toBe('ok')
  })

  it('is "warning" between 1% and 5% error rate', () => {
    expect(classifyFunctionsHealth(1000, 1)).toBe('warning')
    expect(classifyFunctionsHealth(1000, 4.9)).toBe('warning')
  })

  it('is "error" at 5% error rate or above', () => {
    expect(classifyFunctionsHealth(1000, 5)).toBe('error')
    expect(classifyFunctionsHealth(1000, 50)).toBe('error')
  })
})
