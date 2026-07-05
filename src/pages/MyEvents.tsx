import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribeToUserEvents } from '../firebase/events'
import { useAuth } from '../hooks/useAuth'
import { optimizedImageUrl } from '../utils/cloudinary'
import { IconCalendar, IconTicket, IconUsers } from '../components/Icons'
import type { EventData } from '../types'
import { LoadingInline } from '../components/LoadingInline'
import { EmptyState } from '../components/Empty'

const STATUS_LABEL: Record<EventData['status'], string> = {
  active:    'Activo',
  cancelled: 'Cancelado',
  archived:  'Archivado',
}

const STATUS_COLOR: Record<EventData['status'], string> = {
  active:    'bg-green-500/20 text-green-400',
  cancelled: 'bg-red-500/20 text-red-400',
  archived:  'bg-gray-500/20 text-gray-400',
}

const PLAN_COLOR: Record<EventData['plan'], string> = {
  premium: 'bg-yellow-500/20 text-yellow-400',
}

const PLAN_LABEL: Record<EventData['plan'], string> = {
  premium: 'Premium',
}

export function MyEvents() {
  const { user } = useAuth()
  const [events, setEvents]   = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const unsub = subscribeToUserEvents(user.uid, (evts) => {
      setEvents(evts)
      setLoading(false)
    })
    return unsub
    // Depende del uid (primitivo), no del objeto `user` completo: Firebase Auth
    // emite una nueva instancia de user en cada cambio de estado de auth aunque
    // el uid no cambie, y resuscribirse en esos casos sería innecesario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid])

  if (!user) return (
    <div className="max-w-lg mx-auto px-4 py-12 text-center">
      <p className="text-gray-500">
        <Link to="/login" className="text-primary font-medium">Inicia sesión</Link> para ver tus eventos.
      </p>
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Mis eventos</h1>
        <Link
          to="/events/new"
          className="bg-primary text-white rounded-md px-4 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors"
        >
          + Nuevo
        </Link>
      </div>

      {loading && <LoadingInline label="Cargando eventos…" />}

      {!loading && events.length === 0 && (
        <EmptyState
          icon={<IconCalendar className="w-12 h-12" />}
          title="Aún no has creado ningún evento"
          description="Crea tu primer evento y empieza a gestionar invitados con pases QR."
          ctaText="Crear evento"
          to="/events/new"
        />
      )}

      <div className="space-y-3">
        {events.map((ev) => (
          <Link
            key={ev.id}
            to={`/events/${ev.id}`}
            className="flex items-center gap-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 hover:border-primary/40 transition-colors group"
          >
            {/* Cover or placeholder */}
            {ev.coverImage
              ? <img src={optimizedImageUrl(ev.coverImage, 128)} alt="" loading="lazy" className="w-16 h-16 rounded-lg object-cover shrink-0" />
              : (
                <div className="w-16 h-16 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <IconTicket className="w-7 h-7 text-primary" />
                </div>
              )
            }

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="font-semibold text-gray-900 dark:text-white truncate group-hover:text-primary transition-colors">
                  {ev.name}
                </p>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${PLAN_COLOR[ev.plan]}`}>
                  {PLAN_LABEL[ev.plan]}
                </span>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${STATUS_COLOR[ev.status]}`}>
                  {STATUS_LABEL[ev.status]}
                </span>
              </div>
              <p className="text-xs text-gray-500">
                <IconCalendar className="w-3 h-3 inline mr-1 -mt-0.5" />
                {ev.date} · {ev.location}
              </p>
            </div>

            {/* Stats */}
            <div className="shrink-0 text-right">
              <div className="flex items-center gap-1 justify-end text-sm font-semibold text-gray-900 dark:text-white">
                <IconUsers className="w-3.5 h-3.5 text-gray-400" />
                {ev.checkedInCount}/{ev.peopleCount}
              </div>
              <p className="text-[10px] text-gray-500">check-ins</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
