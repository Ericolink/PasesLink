import { useEffect, useMemo, useState } from 'react'
import { subscribeToTables } from '../firebase/seating'
import { partySize } from '../firebase/guests'
import type { GuestData, SeatingTableData } from '../types'

export interface SeatingTableWithOccupancy extends SeatingTableData {
  guests: GuestData[]
  occupancy: number
  isOverCapacity: boolean
}

// Recibe `guests` en vez de suscribirse a la subcolección por su cuenta: la
// pantalla que usa este hook ya la tiene vía useEvent() (para el modal de
// asignación) — resuscribirla acá duplicaría el listener sin necesidad.
export function useSeatingChart(eventId: string | undefined, guests: GuestData[]) {
  const [tables, setTables] = useState<SeatingTableData[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!eventId) return
    const unsubscribe = subscribeToTables(
      eventId,
      (data) => {
        setTables(data)
        setLoading(false)
      },
      () => {
        setError('No se pudieron cargar las mesas. Verifica tu conexión o que sigas teniendo acceso.')
        setLoading(false)
      },
    )
    return unsubscribe
  }, [eventId])

  const { tablesWithOccupancy, unassignedGuests } = useMemo(() => {
    const guestsByTable = new Map<string, GuestData[]>()
    const unassigned: GuestData[] = []
    for (const guest of guests) {
      if (guest.tableId) {
        const list = guestsByTable.get(guest.tableId)
        if (list) list.push(guest)
        else guestsByTable.set(guest.tableId, [guest])
      } else {
        unassigned.push(guest)
      }
    }
    const withOccupancy: SeatingTableWithOccupancy[] = tables.map((table) => {
      const tableGuests = guestsByTable.get(table.id) || []
      const occupancy = tableGuests.reduce((sum, guest) => sum + partySize(guest), 0)
      return { ...table, guests: tableGuests, occupancy, isOverCapacity: occupancy > table.capacity }
    })
    return { tablesWithOccupancy: withOccupancy, unassignedGuests: unassigned }
  }, [tables, guests])

  return { tables: tablesWithOccupancy, unassignedGuests, loading, error }
}
