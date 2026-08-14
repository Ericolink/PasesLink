import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('devuelve el valor inicial de inmediato', () => {
    const { result } = renderHook(() => useDebounce('Juan', 300))
    expect(result.current).toBe('Juan')
  })

  it('no actualiza el valor antes de que pase el retraso', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'J' } })
    rerender({ value: 'Ju' })
    act(() => vi.advanceTimersByTime(200))
    expect(result.current).toBe('J')
  })

  it('actualiza el valor una vez transcurrido el retraso', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'J' } })
    rerender({ value: 'Juan' })
    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('Juan')
  })

  it('reinicia el temporizador con cada cambio (varias teclas seguidas)', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 300), { initialProps: { value: 'J' } })
    rerender({ value: 'Ju' })
    act(() => vi.advanceTimersByTime(200))
    rerender({ value: 'Jua' })
    act(() => vi.advanceTimersByTime(200))
    // Todavía no pasaron 300ms desde el último cambio ("Jua")
    expect(result.current).toBe('J')
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('Jua')
  })
})
