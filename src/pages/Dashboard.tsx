import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { deleteEvent, setEventStatus, subscribeToUserEvents } from '../firebase/events'
import type { EventData } from '../types'
import { PlanBadge } from '../components/PlanBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconCalendar, IconStar, IconTicket } from '../components/Icons'

function isEventPast(date: string): boolean {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return new Date(date + 'T00:00:00') < today
}

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
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showPast, setShowPast] = useState(false)

  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUserEvents(user.uid, (data) => {
      setEvents(data)
      setLoading(false)
      // Auto-archive active events whose date has passed
      data.forEach((ev) => {
        if (ev.status === 'active' && isEventPast(ev.date)) {
          setEventStatus(ev.id, 'archived').catch(() => {})
        }
      })
    })
    return unsubscribe
  }, [user])

  async function handleStatusChange(eventId: string, status: 'cancelled' | 'archived' | 'active') {
    setActionLoading(eventId)
    try {
      await setEventStatus(eventId, status)
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(eventId: string) {
    setActionLoading(eventId)
    try {
      await deleteEvent(eventId)
    } finally {
      setActionLoading(null)
      setConfirmDeleteId(null)
    }
  }

  const eventToDelete = events.find((e) => e.id === confirmDeleteId)
  const activeEvents = events.filter((e) => e.status === 'active')
  const pastEvents = events.filter((e) => e.status !== 'active')

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
        {activeEvents.map((event, i) => <EventCard key={event.id} event={event} index={i} isLoading={actionLoading === event.id} onNavigate={() => navigate(`/events/${event.id}`)} onCancel={() => handleStatusChange(event.id, 'cancelled')} onDelete={() => { setConfirmDeleteId(event.id) }} />)}
      </div>

      {/* Past events */}
      {!loading && pastEvents.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-700 mb-3"
          >
            <span className={`transition-transform ${showPast ? 'rotate-90' : ''}`}>▶</span>
            Eventos pasados ({pastEvents.length})
          </button>
          {showPast && (
            <div className="space-y-3">
              {pastEvents.map((event, i) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={i}
                  past
                  isLoading={actionLoading === event.id}
                  onNavigate={() => navigate(`/events/${event.id}`)}
                  onReactivate={event.status !== 'active' ? () => handleStatusChange(event.id, 'active') : undefined}
                  onDelete={() => { setConfirmDeleteId(event.id) }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        danger
        title={`Eliminar "${eventToDelete?.name ?? ''}"`}
        message="Se borrarán todos los invitados y el historial de check-ins. Esta acción no se puede deshacer."
        confirmLabel={actionLoading ? 'Eliminando...' : 'Sí, eliminar'}
        cancelLabel="Cancelar"
        onConfirm={() => confirmDeleteId && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

interface EventCardProps {
  event: EventData
  index: number
  past?: boolean
  isLoading: boolean
  onNavigate: () => void
  onCancel?: () => void
  onReactivate?: () => void
  onDelete: () => void
}

function EventCard({ event, index, past, isLoading, onNavigate, onCancel, onReactivate, onDelete }: EventCardProps) {
  const progress = event.guestCount > 0 ? Math.min(100, (event.checkedInCount / event.guestCount) * 100) : 0
  return (
    <div
      style={{ animationDelay: `${Math.min(index, 6) * 0.06}s` }}
      className={`card-hover animate-fade-in-up border rounded-lg bg-white dark:bg-gray-800 hover:border-primary transition-colors ${past ? 'border-gray-100 opacity-80' : 'border-gray-200'}`}
    >
      <button onClick={onNavigate} disabled={isLoading} className="w-full text-left p-4 pb-3">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
            {event.plan === 'premium' ? (
              <IconStar className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <IconTicket className="w-4 h-4 text-primary shrink-0" />
            )}
            {event.name}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            <PlanBadge plan={event.plan} />
            {event.status !== 'active' && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[event.status]}`}>
                {STATUS_LABELS[event.status]}
              </span>
            )}
          </div>
        </div>
        <p className="text-sm text-gray-500">{event.date} · {event.location}</p>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>{event.checkedInCount} / {event.guestCount} confirmados</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
        </div>
      </button>
      <div className="px-4 pb-3 flex items-center justify-between gap-2 border-t border-gray-50 dark:border-gray-700">
        {!past ? (
          <Link to={`/events/${event.id}/scan`} className="text-xs font-medium text-primary hover:underline">
            Escanear QR
          </Link>
        ) : <span />}
        <div className="flex items-center gap-1">
          {onCancel && (
            <button onClick={onCancel} disabled={isLoading}
              className="text-xs text-gray-500 hover:text-red-600 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-red-50 transition-colors disabled:opacity-40">
              Cancelar
            </button>
          )}
          {onReactivate && (
            <button onClick={onReactivate} disabled={isLoading}
              className="text-xs text-gray-500 hover:text-green-600 border border-gray-200 rounded-md px-2.5 py-1 hover:bg-green-50 transition-colors disabled:opacity-40">
              Reactivar
            </button>
          )}
          <button onClick={onDelete} disabled={isLoading}
            className="text-xs text-red-500 hover:text-red-700 border border-red-200 rounded-md px-2.5 py-1 hover:bg-red-50 transition-colors disabled:opacity-40">
            {isLoading ? '...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </div>
  )
}
