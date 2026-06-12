import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { subscribeToUserEvents } from '../firebase/events'
import type { EventData } from '../types'
import { PlanBadge } from '../components/PlanBadge'

const STATUS_LABELS: Record<EventData['status'], string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

const STATUS_STYLES: Record<EventData['status'], string> = {
  active: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  archived: 'bg-gray-100 text-gray-600',
}

export function Dashboard() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUserEvents(user.uid, (data) => {
      setEvents(data)
      setLoading(false)
    })
    return unsubscribe
  }, [user])

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mis eventos</h1>
          {user?.email && <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>}
        </div>
        <Link
          to="/events/new"
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors shrink-0"
        >
          + Nuevo evento
        </Link>
      </div>

      {loading && <p className="text-gray-500">Cargando eventos...</p>}

      {!loading && events.length === 0 && (
        <div className="text-center border border-dashed border-gray-300 rounded-lg py-16 bg-white">
          <div className="text-3xl mb-2">🎉</div>
          <p className="text-gray-500 mb-4">Todavía no tienes eventos.</p>
          <Link
            to="/events/new"
            className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Crea tu primer evento
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {events.map((event) => {
          const progress = event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0
          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              className="block border border-gray-200 rounded-lg p-4 bg-white hover:border-primary hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="font-medium text-gray-900">{event.name}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <PlanBadge plan={event.plan} />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[event.status]}`}>
                    {STATUS_LABELS[event.status]}
                  </span>
                </div>
              </div>
              <p className="text-sm text-gray-500">
                {event.date} · {event.location}
              </p>
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>
                    {event.checkedInCount} / {event.guestCount} confirmados
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
