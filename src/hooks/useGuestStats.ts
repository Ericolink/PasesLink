import { useMemo } from 'react'
import type { GuestData } from '../types'

// Extraído de EventDetail.tsx (Subfase 3.3): agrupados en un solo useMemo
// porque todos recorren el mismo array `guests` — sin esto, cada re-render
// del componente que use este hook por estado no relacionado (toasts, input
// de co-organizador, exportPdf, etc.) repetía 6 recorridos O(n) completos,
// notorio en eventos con cientos de invitados.
export function useGuestStats(guests: GuestData[], ticketPrice: number) {
  return useMemo(() => {
    const insideGuests = guests.filter((g) => g.status === 'checked_in' && !g.checkedOutAt)
    return {
      totalPeople: guests.reduce((sum, g) => sum + 1 + g.companions.length, 0),
      totalCollected: guests
        .filter((g) => g.paymentStatus === 'paid')
        .reduce((sum, g) => sum + ticketPrice * (1 + g.companions.length), 0),
      peopleInside: insideGuests.reduce((sum, g) => sum + 1 + g.companions.length, 0),
      rsvpYes: guests.filter((g) => g.rsvpStatus === 'yes').length,
      rsvpNo: guests.filter((g) => g.rsvpStatus === 'no').length,
    }
  }, [guests, ticketPrice])
}
