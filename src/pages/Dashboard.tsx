import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { subscribeToUserEvents } from '../firebase/events'
import type { EventData } from '../types'
import { PlanBadge } from '../components/PlanBadge'
import { IconCalendar, IconStar, IconTicket } from '../components/Icons'

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
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Mis eventos</h1>
          {user?.email && <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>}
        </div>
        <Link
          to="/events/new"
          className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors hover:-translate-y-0.5 hover:shadow-md shrink-0"
        >
          + Nuevo evento
        </Link>
      </div>

      {loading && <p className="text-gray-500">Cargando eventos...</p>}

      {!loading && events.length === 0 && (
        <div className="text-center border border-dashed border-gray-300 rounded-lg py-16 bg-white animate-fade-in-up">
          <IconCalendar className="w-12 h-12 mb-3 mx-auto text-gray-300" />
          <h2 className="text-lg font-medium text-gray-900 mb-1">Todavía no tienes eventos</h2>
          <p className="text-gray-500 mb-4 max-w-sm mx-auto">
            Crea tu primer evento, agrega invitados y genera sus pases con QR en pocos minutos.
          </p>
          <Link
            to="/events/new"
            className="inline-block bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors hover:-translate-y-0.5 hover:shadow-md"
          >
            Crea tu primer evento
          </Link>
        </div>
      )}

      <div className="space-y-3">
        {events.map((event, i) => {
          const progress = event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0
          return (
            <Link
              key={event.id}
              to={`/events/${event.id}`}
              style={{ animationDelay: `${Math.min(i, 6) * 0.06}s` }}
              className="card-hover animate-fade-in-up block border border-gray-200 rounded-lg p-4 bg-white hover:border-primary transition-colors"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <h2 className="font-medium text-gray-900 flex items-center gap-2">
                  {event.plan === 'premium' ? (
                    <IconStar className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <IconTicket className="w-4 h-4 text-primary shrink-0" />
                  )}
                  {event.name}
                </h2>
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
                  <div
                    className="h-full bg-primary rounded-full transition-all duration-500"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
