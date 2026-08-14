import type { GuestData } from '../types'

// Nombre + apellido concatenados cubre los tres casos pedidos (nombre solo,
// apellido solo, "Nombre Apellido" completo) sin necesitar lógica aparte
// para cada uno. Compartido entre GuestSearchBar (EventDetail) y
// AssignGuestModal (Seating) para no repetir el mismo criterio dos veces.
export function matchesGuestSearch(guest: Pick<GuestData, 'name' | 'lastName'>, rawTerm: string): boolean {
  const term = rawTerm.trim().toLowerCase()
  if (!term) return true
  return `${guest.name} ${guest.lastName || ''}`.toLowerCase().includes(term)
}

export type GuestStatusFilter = 'all' | 'confirmed' | 'scanned' | 'declined' | 'pending'
export type GuestSortBy = 'newest' | 'oldest' | 'az' | 'za'

type FilterableGuest = Pick<GuestData, 'name' | 'lastName' | 'rsvpStatus' | 'status' | 'createdAt'>

// Extraída de EventDetail.tsx para poder testear búsqueda + filtro + orden
// combinados sin montar la página completa (que arrastra Firebase y una
// docena de hooks). Misma lógica, solo movida.
export function filterAndSortGuests<T extends FilterableGuest>(
  guests: T[],
  { search, statusFilter, sortBy }: { search: string; statusFilter: GuestStatusFilter; sortBy: GuestSortBy },
): T[] {
  const filtered = guests.filter((g) => {
    if (!matchesGuestSearch(g, search)) return false
    if (statusFilter === 'confirmed') return g.rsvpStatus === 'yes'
    if (statusFilter === 'scanned') return g.status === 'checked_in'
    if (statusFilter === 'declined') return g.rsvpStatus === 'no'
    if (statusFilter === 'pending') return g.rsvpStatus === 'pending' && g.status !== 'checked_in'
    return true
  })
  return [...filtered].sort((a, b) => {
    if (sortBy === 'az') return `${a.name} ${a.lastName || ''}`.localeCompare(`${b.name} ${b.lastName || ''}`)
    if (sortBy === 'za') return `${b.name} ${b.lastName || ''}`.localeCompare(`${a.name} ${a.lastName || ''}`)
    if (sortBy === 'oldest') return a.createdAt - b.createdAt
    return b.createdAt - a.createdAt
  })
}
