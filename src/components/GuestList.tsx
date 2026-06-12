import { Link } from 'react-router-dom'
import type { GuestData } from '../types'

export function GuestList({ eventId, guests }: { eventId: string; guests: GuestData[] }) {
  if (guests.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">Todavía no agregaste invitados.</p>
  }

  return (
    <div className="divide-y divide-gray-100">
      {guests.map((guest) => (
        <div key={guest.id} className="flex items-center justify-between py-2.5">
          <div>
            <p className="font-medium text-gray-900 text-sm">{guest.name}</p>
            {guest.email && <p className="text-xs text-gray-500">{guest.email}</p>}
          </div>
          <div className="flex items-center gap-3">
            {guest.status === 'checked_in' ? (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                Confirmado
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                Invitado
              </span>
            )}
            <Link
              to={`/pass/${eventId}/${guest.qrToken}`}
              target="_blank"
              className="text-xs text-primary font-medium"
            >
              Ver pase
            </Link>
          </div>
        </div>
      ))}
    </div>
  )
}
