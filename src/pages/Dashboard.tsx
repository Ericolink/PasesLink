import { useMemo, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { deleteEvent, setEventStatus, subscribeToUserEvents } from '../firebase/events'
import type { EventData } from '../types'
import { PlanBadge } from '../components/PlanBadge'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { IconBarChart, IconCalendar, IconCheckCircle, IconStar, IconTicket, IconUsers } from '../components/Icons'
import { LoadingInline } from '../components/LoadingInline'
import { formatDate } from '../utils/time'

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

// Devuelve los últimos N meses como etiquetas cortas ['Ene', 'Feb', ...]
function lastNMonthLabels(n: number): string[] {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(months[d.getMonth()])
  }
  return result
}

// Cuenta eventos por mes (key = 'YYYY-MM') en los últimos N meses
function eventsPerMonth(events: EventData[], n: number): number[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    return events.filter((e) => e.date.startsWith(key)).length
  })
}

export function Dashboard() {
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const navigate = useNavigate()
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [showPast, setShowPast] = useState(false)
  const archivingRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUserEvents(user.uid, (data) => {
      setEvents(data)
      setLoading(false)
      data.forEach((ev) => {
        if (ev.status === 'active' && isEventPast(ev.date) && !archivingRef.current.has(ev.id)) {
          archivingRef.current.add(ev.id)
          setEventStatus(ev.id, 'archived').catch((err) => {
            archivingRef.current.delete(ev.id)
            console.error('Error archiving past event:', err)
          })
        }
      })
    })
    return unsubscribe
  }, [user])

  const stats = useMemo(() => {
    const totalGuests = events.reduce((s, e) => s + e.guestCount, 0)
    const totalCheckins = events.reduce((s, e) => s + e.checkedInCount, 0)
    const attendanceRate =
      totalGuests > 0 ? Math.round((totalCheckins / totalGuests) * 100) : null
    const bestEvent = events.length > 0
      ? events.reduce((best, e) => (e.guestCount > best.guestCount ? e : best), events[0])
      : null
    return { totalGuests, totalCheckins, attendanceRate, bestEvent }
  }, [events])

  const activeEvents = events.filter((e) => e.status === 'active')
  const pastEvents = events.filter((e) => e.status !== 'active')

  const nextEvent = useMemo(() =>
    activeEvents
      .filter((e) => !isEventPast(e.date))
      .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null
  , [activeEvents])

  const CHART_MONTHS = 6
  const monthLabels = lastNMonthLabels(CHART_MONTHS)
  const monthCounts = eventsPerMonth(events, CHART_MONTHS)
  const maxMonthCount = Math.max(...monthCounts, 1)

  async function handleStatusChange(eventId: string, status: 'cancelled' | 'archived' | 'active') {
    setActionLoading(eventId)
    setActionError('')
    try {
      await setEventStatus(eventId, status)
    } catch {
      setActionError('No se pudo actualizar el estado del evento. Intenta de nuevo.')
    } finally {
      setActionLoading(null)
    }
  }

  async function handleDelete(eventId: string) {
    setActionLoading(eventId)
    setActionError('')
    try {
      await deleteEvent(eventId)
    } catch {
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setActionLoading(null)
      setConfirmDeleteId(null)
    }
  }

  const eventToDelete = events.find((e) => e.id === confirmDeleteId)
  const firstName = profile?.firstName || user?.email?.split('@')[0] || ''

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">
            {firstName ? `Hola, ${firstName}` : 'Mis eventos'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {firstName ? 'Mis eventos' : user?.email}
          </p>
        </div>
        <Link
          to="/events/new"
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-semibold hover:-translate-y-0.5 transition-all shrink-0"
        >
          + Nuevo evento
        </Link>
      </div>

      {actionError && (
        <p
          className="text-sm rounded-lg px-3 py-2 mb-4"
          style={{ background: 'rgba(255,20,100,.1)', border: '1px solid rgba(255,20,100,.3)', color: '#FF1464' }}
        >
          {actionError}
        </p>
      )}

      {/* Stats bar */}
      {!loading && events.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Eventos', value: events.length, icon: IconCalendar },
            { label: 'Invitados', value: stats.totalGuests, icon: IconUsers },
            { label: 'Check-ins', value: stats.totalCheckins, icon: IconCheckCircle },
            {
              label: 'Asistencia',
              value: stats.attendanceRate !== null ? `${stats.attendanceRate}%` : '—',
              icon: IconBarChart,
            },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl p-3 text-center"
              style={{ background: 'rgba(30,20,40,.7)', border: '1px solid rgba(74,50,92,.8)' }}
            >
              <Icon className="w-4 h-4 text-primary mx-auto mb-1" />
              <p className="text-xl font-bold text-white">{value}</p>
              <p className="text-xs text-gray-500">{label}</p>
            </div>
          ))}
        </div>
      )}

      {loading && <LoadingInline label="Cargando eventos…" />}

      {/* Próximo evento destacado */}
      {!loading && nextEvent && (
        <div
          className="rounded-xl p-4 mb-6 cursor-pointer hover:opacity-90 transition-opacity"
          style={{
            background: 'linear-gradient(135deg, rgba(255,20,100,.12), rgba(255,20,100,.04))',
            border: '1px solid rgba(255,20,100,.3)',
          }}
          onClick={() => navigate(`/events/${nextEvent.id}`)}
          role="button"
          aria-label={`Ver evento: ${nextEvent.name}`}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-1">Próximo evento</p>
          <h2 className="text-lg font-bold text-white">{nextEvent.name}</h2>
          <p className="text-sm text-gray-400 mt-0.5">{formatDate(nextEvent.date)} · {nextEvent.location}</p>
          <div className="flex items-center gap-4 mt-3 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <IconUsers className="w-3.5 h-3.5" /> {nextEvent.guestCount} invitados
            </span>
            <span className="flex items-center gap-1">
              <IconCheckCircle className="w-3.5 h-3.5" /> {nextEvent.checkedInCount} check-ins
            </span>
          </div>
        </div>
      )}

      {/* Gráfico de actividad mensual */}
      {!loading && events.length >= 2 && monthCounts.some((c) => c > 0) && (
        <div
          className="rounded-xl p-4 mb-6"
          style={{ background: 'rgba(30,20,40,.7)', border: '1px solid rgba(74,50,92,.8)' }}
        >
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Actividad (últimos 6 meses)
          </p>
          <div className="flex items-end gap-1.5 h-16">
            {monthCounts.map((count, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex items-end" style={{ height: '52px' }}>
                  <div
                    className="w-full rounded-t transition-all"
                    style={{
                      height: count > 0 ? `${Math.max(16, (count / maxMonthCount) * 52)}px` : '3px',
                      background: count > 0 ? 'linear-gradient(180deg,#FF1464,#D40E52)' : 'rgba(74,50,92,.6)',
                      boxShadow: count > 0 ? '0 0 6px rgba(255,20,100,.4)' : 'none',
                    }}
                  />
                </div>
                <span className="text-[10px] text-gray-500">{monthLabels[i]}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && events.length === 0 && (
        <div
          className="text-center rounded-2xl py-16 animate-fade-in-up"
          style={{ background: 'rgba(30,20,40,.5)', border: '1px dashed rgba(74,50,92,.9)' }}
        >
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'rgba(255,20,100,.1)', border: '1px solid rgba(255,20,100,.2)' }}
          >
            <IconCalendar className="w-6 h-6 text-primary" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-1">Todavía no tienes eventos</h2>
          <p className="text-gray-500 mb-6 max-w-sm mx-auto text-sm">
            Crea tu primer evento, agrega invitados y genera sus pases con QR en pocos minutos.
          </p>
          <Link
            to="/events/new"
            className="inline-block bg-primary text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:-translate-y-0.5 transition-all"
          >
            Crea tu primer evento
          </Link>
        </div>
      )}

      {/* Active events */}
      <div className="space-y-3">
        {activeEvents.map((event, i) => (
          <EventCard
            key={event.id}
            event={event}
            index={i}
            isLoading={actionLoading === event.id}
            onNavigate={() => navigate(`/events/${event.id}`)}
            onCancel={() => handleStatusChange(event.id, 'cancelled')}
            onDelete={() => setConfirmDeleteId(event.id)}
          />
        ))}
      </div>

      {/* Past events */}
      {!loading && pastEvents.length > 0 && (
        <div className="mt-8">
          <button
            onClick={() => setShowPast((v) => !v)}
            className="flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-300 mb-3 transition-colors"
          >
            <span className={`transition-transform duration-200 ${showPast ? 'rotate-90' : ''}`}>▶</span>
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
                  onDelete={() => setConfirmDeleteId(event.id)}
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
        confirmLabel={actionLoading ? 'Eliminando…' : 'Sí, eliminar'}
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
  const attendanceRate = event.guestCount > 0 ? Math.round((event.checkedInCount / event.guestCount) * 100) : null

  return (
    <div
      style={{
        animationDelay: `${Math.min(index, 6) * 0.06}s`,
        borderLeft: past ? undefined : '3px solid #FF1464',
        boxShadow: past ? undefined : '0 0 20px rgba(255,20,100,.06)',
      }}
      className={`card-hover animate-fade-in-up rounded-xl overflow-hidden ${past ? 'opacity-70' : ''}`}
    >
      <div
        style={{
          background: 'rgba(30,20,40,.8)',
          border: '1px solid rgba(74,50,92,.7)',
          borderLeft: past ? '1px solid rgba(74,50,92,.7)' : 'none',
        }}
      >
        {/* Clickable body */}
        <button onClick={onNavigate} disabled={isLoading} className="w-full text-left p-4 pb-3">
          <div className="flex items-start justify-between gap-2 mb-1">
            <h2 className="font-semibold text-white flex items-center gap-2">
              {event.plan === 'premium'
                ? <IconStar className="w-4 h-4 text-amber-400 shrink-0" />
                : <IconTicket className="w-4 h-4 text-primary shrink-0" />
              }
              {event.name}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <PlanBadge plan={event.plan} />
              {event.status !== 'active' && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: event.status === 'cancelled' ? 'rgba(255,20,100,.15)' : 'rgba(74,50,92,.8)',
                    color: event.status === 'cancelled' ? '#FF1464' : '#9C8FA8',
                    border: `1px solid ${event.status === 'cancelled' ? 'rgba(255,20,100,.3)' : 'rgba(74,50,92,.9)'}`,
                  }}
                >
                  {STATUS_LABELS[event.status]}
                </span>
              )}
            </div>
          </div>

          <p className="text-sm text-gray-500 mb-3">{formatDate(event.date)} · {event.location}</p>

          {/* Progress */}
          <div>
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
              <span>
                {event.checkedInCount} / {event.guestCount} check-ins
                {attendanceRate !== null && past && (
                  <span className="ml-1.5 text-gray-600">({attendanceRate}% asistencia)</span>
                )}
              </span>
              {event.capacity > 0 && (
                <span className="text-gray-600">cap. {event.capacity}</span>
              )}
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(74,50,92,.8)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progress}%`,
                  background: progress > 0 ? 'linear-gradient(90deg, #FF1464, #D40E52)' : 'transparent',
                  boxShadow: progress > 0 ? '0 0 6px rgba(255,20,100,.5)' : 'none',
                }}
              />
            </div>
          </div>
        </button>

        {/* Action row */}
        <div
          className="px-4 pb-3 pt-2 flex items-center justify-between gap-2"
          style={{ borderTop: '1px solid rgba(74,50,92,.5)' }}
        >
          {!past ? (
            <Link
              to={`/events/${event.id}/scan`}
              className="text-xs font-medium text-primary hover:underline"
            >
              Escanear QR
            </Link>
          ) : <span />}

          <div className="flex items-center gap-1.5">
            {onCancel && (
              <button
                onClick={onCancel}
                disabled={isLoading}
                className="text-xs px-2.5 py-1 rounded-md transition-colors disabled:opacity-40"
                style={{ background: 'rgba(74,50,92,.5)', border: '1px solid rgba(74,50,92,.9)', color: '#A89FB3' }}
              >
                Cancelar
              </button>
            )}
            {onReactivate && (
              <button
                onClick={onReactivate}
                disabled={isLoading}
                className="text-xs px-2.5 py-1 rounded-md transition-colors disabled:opacity-40"
                style={{ background: 'rgba(26,100,26,.2)', border: '1px solid rgba(34,197,94,.2)', color: '#4ade80' }}
              >
                Reactivar
              </button>
            )}
            <button
              onClick={onDelete}
              disabled={isLoading}
              className="text-xs px-2.5 py-1 rounded-md transition-colors disabled:opacity-40"
              style={{ background: 'rgba(255,20,100,.1)', border: '1px solid rgba(255,20,100,.3)', color: '#FF1464' }}
            >
              {isLoading ? '…' : 'Eliminar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
