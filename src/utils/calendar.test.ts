import { describe, expect, it } from 'vitest'
import { buildIcsFile } from './calendar'

describe('buildIcsFile', () => {
  it('builds a timed event with explicit start and end', () => {
    const ics = buildIcsFile({
      uid: 'evt-1@paselink',
      name: 'Cumpleaños de Ana',
      date: '2026-08-15',
      startTime: '20:00',
      endTime: '23:00',
      location: 'Salón Los Olivos',
    })

    expect(ics).toContain('DTSTART:20260815T200000')
    expect(ics).toContain('DTEND:20260815T230000')
    expect(ics).toContain('SUMMARY:Cumpleaños de Ana')
    expect(ics).toContain('LOCATION:Salón Los Olivos')
    expect(ics).toMatch(/^BEGIN:VCALENDAR\r\n/)
    expect(ics.trim().endsWith('END:VCALENDAR')).toBe(true)
  })

  it('defaults the end time to 2 hours after start when endTime is missing', () => {
    const ics = buildIcsFile({
      uid: 'evt-2@paselink',
      name: 'Evento sin hora de fin',
      date: '2026-08-15',
      startTime: '22:30',
    })

    expect(ics).toContain('DTSTART:20260815T223000')
    expect(ics).toContain('DTEND:20260816T003000')
  })

  it('builds an all-day event (no startTime) with an exclusive DTEND on the next day', () => {
    const ics = buildIcsFile({
      uid: 'evt-3@paselink',
      name: 'Evento sin hora',
      date: '2026-08-15',
    })

    expect(ics).toContain('DTSTART;VALUE=DATE:20260815')
    expect(ics).toContain('DTEND;VALUE=DATE:20260816')
  })

  it('escapes reserved ICS characters in text fields', () => {
    const ics = buildIcsFile({
      uid: 'evt-4@paselink',
      name: 'Fiesta, grande; especial',
      date: '2026-08-15',
      description: 'Línea uno\nLínea dos',
    })

    expect(ics).toContain('SUMMARY:Fiesta\\, grande\\; especial')
    expect(ics).toContain('DESCRIPTION:Línea uno\\nLínea dos')
  })
})
