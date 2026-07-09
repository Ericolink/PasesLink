import { describe, expect, it, vi } from 'vitest'
import { compareEventsByRelevance, isEventPast } from './time'

// "Hoy" fijo para que los tests no dependan de la fecha real de ejecución.
const TODAY = new Date('2026-07-09T12:00:00')

describe('isEventPast', () => {
  it('un evento de hoy no cuenta como pasado, aunque su hora ya haya ocurrido', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    expect(isEventPast('2026-07-09')).toBe(false)
    vi.useRealTimers()
  })

  it('marca como pasado un evento con fecha anterior a hoy', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    expect(isEventPast('2026-07-08')).toBe(true)
    vi.useRealTimers()
  })

  it('no marca como pasado un evento con fecha futura', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    expect(isEventPast('2026-07-10')).toBe(false)
    vi.useRealTimers()
  })
})

describe('compareEventsByRelevance', () => {
  const mañana = { date: '2026-07-10' }
  const proximaSemana = { date: '2026-07-16' }
  const proximoMes = { date: '2026-08-09' }
  const haceUnaSemana = { date: '2026-07-02' }
  const haceUnMes = { date: '2026-06-09' }

  it('ordena futuros del más cercano al más lejano, y pasados del más reciente al más antiguo, con futuros siempre primero', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const events = [haceUnMes, proximoMes, haceUnaSemana, mañana, proximaSemana]
    const sorted = [...events].sort(compareEventsByRelevance)
    expect(sorted).toEqual([mañana, proximaSemana, proximoMes, haceUnaSemana, haceUnMes])
    vi.useRealTimers()
  })

  it('con la misma fecha, respeta el horario (startTime) para desempatar', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const tarde = { date: '2026-07-10', startTime: '20:00' }
    const temprano = { date: '2026-07-10', startTime: '09:00' }
    expect(compareEventsByRelevance(tarde, temprano)).toBeGreaterThan(0)
    expect(compareEventsByRelevance(temprano, tarde)).toBeLessThan(0)
    vi.useRealTimers()
  })

  it('sin startTime, se asume 00:00 y no rompe el orden', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const sinHora = { date: '2026-07-10' }
    const conHora = { date: '2026-07-10', startTime: '09:00' }
    expect(compareEventsByRelevance(sinHora, conHora)).toBeLessThanOrEqual(0)
    vi.useRealTimers()
  })

  it('un evento de hoy se trata como futuro (no cae al final con los pasados)', () => {
    vi.useFakeTimers()
    vi.setSystemTime(TODAY)
    const hoy = { date: '2026-07-09' }
    const pasado = { date: '2026-07-02' }
    expect(compareEventsByRelevance(hoy, pasado)).toBeLessThan(0)
    vi.useRealTimers()
  })
})
