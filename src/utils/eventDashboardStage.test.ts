import { describe, expect, it } from 'vitest'
import { getDashboardStage } from './eventDashboardStage'

const NOW = new Date('2026-08-15T12:00:00')

function baseEvent(overrides: Partial<Parameters<typeof getDashboardStage>[0]> = {}) {
  return {
    status: 'active' as const,
    date: '2026-08-20',
    guestCount: 10,
    peopleCount: 15,
    capacity: 100,
    attendeeLimitEnabled: true,
    checkedInCount: 0,
    ...overrides,
  }
}

describe('getDashboardStage', () => {
  it('returns "empty" when nobody has registered yet', () => {
    expect(getDashboardStage(baseEvent({ guestCount: 0, peopleCount: 0 }), NOW)).toBe('empty')
  })

  it('returns "open" once there are registrations and capacity is not reached', () => {
    expect(getDashboardStage(baseEvent(), NOW)).toBe('open')
  })

  it('returns "open" for an unlimited-capacity event regardless of headcount', () => {
    expect(getDashboardStage(baseEvent({ attendeeLimitEnabled: false, peopleCount: 500, capacity: 100 }), NOW)).toBe('open')
  })

  it('returns "full" when the attendee limit is enabled and reached', () => {
    expect(getDashboardStage(baseEvent({ peopleCount: 100, capacity: 100 }), NOW)).toBe('full')
  })

  it('does not return "full" when the limit is not enabled, even if headcount exceeds capacity', () => {
    expect(getDashboardStage(baseEvent({ attendeeLimitEnabled: false, peopleCount: 200, capacity: 100 }), NOW)).toBe('open')
  })

  it('returns "waiting_first_checkin" on event day before the first check-in', () => {
    expect(getDashboardStage(baseEvent({ date: '2026-08-15', checkedInCount: 0 }), NOW)).toBe('waiting_first_checkin')
  })

  it('returns "live" on event day once check-ins started', () => {
    expect(getDashboardStage(baseEvent({ date: '2026-08-15', checkedInCount: 3 }), NOW)).toBe('live')
  })

  it('returns "ended" once the event date has passed, even mid-checkin', () => {
    expect(getDashboardStage(baseEvent({ date: '2026-08-10', checkedInCount: 3 }), NOW)).toBe('ended')
  })

  it('returns "ended" for a cancelled event regardless of date', () => {
    expect(getDashboardStage(baseEvent({ status: 'cancelled', date: '2026-08-20' }), NOW)).toBe('ended')
  })

  it('returns "ended" for an archived event', () => {
    expect(getDashboardStage(baseEvent({ status: 'archived', date: '2026-08-01' }), NOW)).toBe('ended')
  })
})
