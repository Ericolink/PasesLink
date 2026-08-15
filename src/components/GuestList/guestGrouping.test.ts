import { describe, expect, it } from 'vitest'
import { groupGuestsByUrgency, guestSummaryBadges, sectionTitle } from './guestGrouping'
import type { GuestData } from '../../types'

function guest(overrides: Partial<GuestData> & { id: string }): GuestData {
  return {
    name: 'Invitado',
    lastName: '',
    qrToken: 'token',
    status: 'invited',
    companions: [],
    rsvpStatus: 'pending',
    paymentStatus: 'unpaid',
    checkedInAt: null,
    checkedInBy: null,
    checkedInByEmail: null,
    checkedOutAt: null,
    checkedOutByEmail: null,
    exitType: null,
    createdAt: 0,
    ...overrides,
  } as GuestData
}

describe('sectionTitle', () => {
  it('evento de pago: la sección "confirmed" se llama "Pagos confirmados"', () => {
    expect(sectionTitle('confirmed', true)).toBe('Pagos confirmados')
  })

  it('evento gratuito: la sección "confirmed" conserva "Confirmados" (es asistencia, no pago)', () => {
    expect(sectionTitle('confirmed', false)).toBe('Confirmados')
  })

  it('el resto de las secciones no cambia con requiresPayment', () => {
    expect(sectionTitle('attention', true)).toBe('Necesita tu atención')
    expect(sectionTitle('confirmed_unpaid', true)).toBe('Pendientes de pago')
    expect(sectionTitle('unanswered', true)).toBe('Sin responder')
    expect(sectionTitle('declined', true)).toBe('No asistirán')
    expect(sectionTitle('unanswered', false)).toBe('Sin responder')
    expect(sectionTitle('declined', false)).toBe('No asistirán')
  })
})

describe('groupGuestsByUrgency', () => {
  it('evento de pago: "confirmed" contiene únicamente invitados con el pago ya aprobado', () => {
    const guests = [
      guest({ id: '1', rsvpStatus: 'yes', paymentStatus: 'paid' }),
      guest({ id: '2', rsvpStatus: 'yes', paymentStatus: 'unpaid' }),
      guest({ id: '3', rsvpStatus: 'yes', paymentStatus: 'pending_confirmation' }),
    ]
    const groups = groupGuestsByUrgency(guests, true)
    expect(groups.confirmed.map((g) => g.id)).toEqual(['1'])
    expect(groups.confirmed_unpaid.map((g) => g.id)).toEqual(['2'])
    expect(groups.attention.map((g) => g.id)).toEqual(['3'])
  })

  it('evento gratuito: "confirmed" son los que respondieron que sí, sin depender del pago', () => {
    const guests = [
      guest({ id: '1', rsvpStatus: 'yes', paymentStatus: 'unpaid' }),
      guest({ id: '2', rsvpStatus: 'pending' }),
    ]
    const groups = groupGuestsByUrgency(guests, false)
    expect(groups.confirmed.map((g) => g.id)).toEqual(['1'])
    expect(groups.confirmed_unpaid).toEqual([])
    expect(groups.attention).toEqual([])
  })
})

describe('guestSummaryBadges', () => {
  it('lista + pago: 3 badges de asistencia (registrados/confirmados/no confirmados), sin importar el pago', () => {
    const guests = [
      guest({ id: '1', rsvpStatus: 'yes', paymentStatus: 'paid' }),
      guest({ id: '2', rsvpStatus: 'yes', paymentStatus: 'unpaid' }), // confirmed_unpaid
      guest({ id: '3', rsvpStatus: 'yes', paymentStatus: 'pending_confirmation' }), // attention
      guest({ id: '4', rsvpStatus: 'pending' }),
      guest({ id: '5', rsvpStatus: 'no' }),
    ]
    const groups = groupGuestsByUrgency(guests, true)
    const badges = guestSummaryBadges(groups, guests.length, 'list', true, 0)
    expect(badges.map((b) => [b.label, b.count])).toEqual([
      ['Registrados', 5],
      ['Confirmados', 3], // rsvp 'yes': paid + confirmed_unpaid + attention
      ['No confirmados', 2], // pending + no
    ])
  })

  it('lista + gratis: mismos 3 badges, "Confirmados" no depende del pago', () => {
    const guests = [
      guest({ id: '1', rsvpStatus: 'yes' }),
      guest({ id: '2', rsvpStatus: 'pending' }),
    ]
    const groups = groupGuestsByUrgency(guests, false)
    const badges = guestSummaryBadges(groups, guests.length, 'list', false, 0)
    expect(badges.map((b) => b.label)).toEqual(['Registrados', 'Confirmados', 'No confirmados'])
    expect(badges.map((b) => b.count)).toEqual([2, 1, 1])
  })

  it('auto-registro (open) + pago: 2 badges de pago, sin waitlist si está vacía', () => {
    const guests = [
      guest({ id: '1', rsvpStatus: 'yes', paymentStatus: 'paid' }),
      guest({ id: '2', rsvpStatus: 'yes', paymentStatus: 'unpaid' }),
    ]
    const groups = groupGuestsByUrgency(guests, true)
    const badges = guestSummaryBadges(groups, guests.length, 'open', true, 0)
    expect(badges.map((b) => b.label)).toEqual(['Pendientes de pago', 'Pagos confirmados'])
    expect(badges.map((b) => b.count)).toEqual([1, 1])
  })

  it('auto-registro (open) + pago + waitlist: agrega el tercer badge solo si hay alguien esperando', () => {
    const groups = groupGuestsByUrgency([], true)
    const conWaitlist = guestSummaryBadges(groups, 0, 'open', true, 4)
    expect(conWaitlist.map((b) => b.label)).toEqual(['Pendientes de pago', 'Pagos confirmados', 'Lista de espera'])
    expect(conWaitlist.at(-1)?.count).toBe(4)

    const sinWaitlist = guestSummaryBadges(groups, 0, 'open', true, 0)
    expect(sinWaitlist.map((b) => b.label)).toEqual(['Pendientes de pago', 'Pagos confirmados'])
  })

  it('auto-registro (open) + gratis: 1 badge de registrados, más waitlist si corresponde', () => {
    const guests = [guest({ id: '1', rsvpStatus: 'yes' }), guest({ id: '2', rsvpStatus: 'yes' })]
    const groups = groupGuestsByUrgency(guests, false)
    const sinWaitlist = guestSummaryBadges(groups, guests.length, 'open', false, 0)
    expect(sinWaitlist.map((b) => [b.label, b.count])).toEqual([['Registrados', 2]])

    const conWaitlist = guestSummaryBadges(groups, guests.length, 'open', false, 3)
    expect(conWaitlist.map((b) => b.label)).toEqual(['Registrados', 'Lista de espera'])
    expect(conWaitlist.at(-1)?.count).toBe(3)
  })

  it('estados vacíos: incluye un texto secundario cuando el badge de pago da 0', () => {
    const groups = groupGuestsByUrgency([], true)
    const badges = guestSummaryBadges(groups, 0, 'open', true, 0)
    expect(badges.find((b) => b.label === 'Pendientes de pago')?.sub).toBe('No hay pagos pendientes.')
    expect(badges.find((b) => b.label === 'Pagos confirmados')?.sub).toBe('Todavía no hay pagos confirmados.')
  })
})
