import { describe, expect, it } from 'vitest'
import { filterAndSortGuests, matchesGuestSearch } from './guestSearch'
import type { GuestData } from '../types'

function guest(overrides: Partial<GuestData> & { id: string }): GuestData {
  return {
    name: 'Invitado',
    lastName: '',
    qrToken: 'token',
    status: 'invited',
    companions: [],
    rsvpStatus: 'pending',
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

describe('matchesGuestSearch', () => {
  it('sin término, coincide con cualquier invitado', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, '')).toBe(true)
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, '   ')).toBe(true)
  })

  it('busca por nombre', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, 'Juan')).toBe(true)
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, 'juan')).toBe(true)
  })

  it('busca por apellido', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, 'Pérez')).toBe(true)
  })

  it('busca por nombre completo', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, 'Juan Pérez')).toBe(true)
  })

  it('no coincide con un término que no aparece', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: 'Pérez' }, 'María')).toBe(false)
  })

  it('funciona sin apellido cargado', () => {
    expect(matchesGuestSearch({ name: 'Juan', lastName: undefined }, 'Juan')).toBe(true)
    expect(matchesGuestSearch({ name: 'Juan', lastName: undefined }, 'Pérez')).toBe(false)
  })
})

describe('filterAndSortGuests', () => {
  const guests = [
    guest({ id: '1', name: 'Juan', lastName: 'Pérez', rsvpStatus: 'yes', status: 'invited', createdAt: 3 }),
    guest({ id: '2', name: 'Juana', lastName: 'Gómez', rsvpStatus: 'pending', status: 'invited', createdAt: 1 }),
    guest({ id: '3', name: 'María', lastName: 'Pérez', rsvpStatus: 'no', status: 'invited', createdAt: 2 }),
    guest({ id: '4', name: 'Carlos', lastName: 'Ruiz', rsvpStatus: 'yes', status: 'checked_in', createdAt: 4 }),
  ]

  it('combina búsqueda de texto con filtro de estado (Juan + Confirmados)', () => {
    const result = filterAndSortGuests(guests, { search: 'Juan', statusFilter: 'confirmed', sortBy: 'newest' })
    expect(result.map((g) => g.id)).toEqual(['1'])
  })

  it('combina búsqueda de apellido con filtro (Pérez + Confirmados)', () => {
    const result = filterAndSortGuests(guests, { search: 'Pérez', statusFilter: 'confirmed', sortBy: 'newest' })
    expect(result.map((g) => g.id)).toEqual(['1'])
  })

  it('filtra solo por estado sin texto de búsqueda', () => {
    const result = filterAndSortGuests(guests, { search: '', statusFilter: 'scanned', sortBy: 'newest' })
    expect(result.map((g) => g.id)).toEqual(['4'])
  })

  it('sin filtros devuelve todos ordenados por más nuevos primero (default)', () => {
    const result = filterAndSortGuests(guests, { search: '', statusFilter: 'all', sortBy: 'newest' })
    expect(result.map((g) => g.id)).toEqual(['4', '1', '3', '2'])
  })

  it('ordena A–Z por nombre completo', () => {
    const result = filterAndSortGuests(guests, { search: '', statusFilter: 'all', sortBy: 'az' })
    expect(result.map((g) => g.id)).toEqual(['4', '1', '2', '3'])
  })

  it('devuelve vacío cuando ninguna combinación coincide', () => {
    const result = filterAndSortGuests(guests, { search: 'Zzz', statusFilter: 'all', sortBy: 'newest' })
    expect(result).toEqual([])
  })
})
