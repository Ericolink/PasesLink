import { useMemo, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUserProfile } from '../hooks/useUserProfile'
import { setEventStatus, subscribeToUserEvents } from '../firebase/events'
import type { EventData } from '../types'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { EventTicketCard } from '../components/EventTicketCard'
import { PassInfoCell } from '../components/PassInfoCell'
import { WelcomeModal } from '../components/WelcomeModal'
import { IconCalendar } from '../components/Icons'
import { LoadingInline } from '../components/LoadingInline'
import { formatDate, formatTime12h, isEventPast } from '../utils/time'
import { consumeWelcomePending, hasSeenNovedades, markNovedadesSeen } from '../utils/onboarding'

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

// Devuelve los últimos N meses como etiquetas cortas ['Ene', 'Feb', ...]
function lastNMonthLabels(n: number): string[] {
  const result: string[] = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(MONTH_LABELS[d.getMonth()])
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
  useDocumentTitle('Inicio')
  const { user } = useAuth()
  const { profile } = useUserProfile()
  const [events, setEvents] = useState<EventData[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)
  const [onboardingModal, setOnboardingModal] = useState<'welcome' | 'novedades' | null>(null)
  const archivingRef = useRef<Set<string>>(new Set())

  // Se decide una sola vez por sesión de uid: bienvenida si la cuenta se
  // acaba de crear (ver markWelcomePending en firebase/auth.ts), o novedades
  // si ya tenía cuenta pero no vio la versión actual del aviso. Nunca ambos
  // a la vez — quien recibe la bienvenida ya se entera de todo lo nuevo.
  // Necesita ser un efecto (no un initializer de useState) porque `user` se
  // resuelve de forma asíncrona después del primer render (useAuth).
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!user) return
    if (consumeWelcomePending(user.uid)) {
      setOnboardingModal('welcome')
      markNovedadesSeen(user.uid)
    } else if (!hasSeenNovedades(user.uid)) {
      setOnboardingModal('novedades')
    }
  }, [user])
  /* eslint-enable react-hooks/set-state-in-effect */

  function closeOnboardingModal() {
    if (user && onboardingModal === 'novedades') markNovedadesSeen(user.uid)
    setOnboardingModal(null)
  }

  useEffect(() => {
    if (!user) return
    const unsubscribe = subscribeToUserEvents(user.uid, (data) => {
      setEvents(data)
      setLoading(false)
      data.forEach((ev) => {
        // Solo el dueño puede escribir `status` (ver firestore.rules) — ahora
        // que esta lista también trae eventos co-organizados (subscribeToUserEvents
        // fusiona ambos), sin este chequeo un co-anfitrión intentaría archivar
        // el evento de otro y le rebotaría permission-denied en cada snapshot.
        if (ev.status === 'active' && isEventPast(ev.date) && ev.ownerId === user.uid && !archivingRef.current.has(ev.id)) {
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

  const activeEvents = events.filter((e) => e.status === 'active')
  const pastEvents = events.filter((e) => e.status !== 'active')

  // activeEvents ya viene ordenado por relevancia (compareEventsByRelevance,
  // ver subscribeToUserEvents) con los futuros primero de más cercano a más
  // lejano, así que el primero no vencido es directamente el próximo evento.
  const nextEvent = useMemo(() =>
    activeEvents.find((e) => !isEventPast(e.date)) ?? null
  , [activeEvents])

  const CHART_MONTHS = 6
  const monthLabels = lastNMonthLabels(CHART_MONTHS)
  const monthCounts = eventsPerMonth(events, CHART_MONTHS)
  const maxMonthCount = Math.max(...monthCounts, 1)

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

      {loading && <LoadingInline label="Cargando eventos…" />}

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
          <EventTicket key={event.id} event={event} index={i} isNext={nextEvent?.id === event.id} />
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
                <EventTicket key={event.id} event={event} index={i} past />
              ))}
            </div>
          )}
        </div>
      )}

      <WelcomeModal
        open={onboardingModal !== null}
        variant={onboardingModal ?? 'welcome'}
        firstName={profile?.firstName}
        onClose={closeOnboardingModal}
      />
    </div>
  )
}

interface EventTicketProps {
  event: EventData
  index: number
  past?: boolean
  /** El evento activo con fecha más próxima entre los que se muestran — resalta la tarjeta como "boleto destacado". */
  isNext?: boolean
}

// Boleto 100% informativo: tap abre EventDetail, que ya tiene "Escanear
// pases" (fila primaria) y Cancelar/Eliminar (colapsable "Gestión del
// evento", solo dueño, con ConfirmDialog) — nada de eso vive acá para
// evitar toques accidentales en una lista que se scrollea rápido.
function EventTicket({ event, index, past, isNext }: EventTicketProps) {
  const highlight = !!isNext && !past

  return (
    <EventTicketCard
      href={`/events/${event.id}`}
      index={index}
      date={event.date}
      templateId={event.templateId}
      accentColor={event.accentColor}
      status={event.status}
      highlight={highlight}
      dimmed={past}
      title={event.name}
      subtitle={`${formatDate(event.date)} · ${event.location}`}
      body={
        event.startTime ? (
          <div className="flex items-center gap-6">
            <PassInfoCell label="Inicio" value={formatTime12h(event.startTime)} />
            {event.endTime && <PassInfoCell label="Fin" value={formatTime12h(event.endTime)} />}
          </div>
        ) : (
          <p className="text-xs text-[var(--invite-text-muted,#6b7280)]">Horario no definido</p>
        )
      }
      footer={
        <AttendanceProgressBar
          present={event.checkedInCount}
          expected={event.peopleCount}
          unitLabel="check-ins"
          variant="glow"
          showPercentage
          percentSuffix="asistencia"
          rightLabel={event.capacity > 0 ? <span className="text-[var(--invite-text-muted,#4b5563)]">cap. {event.capacity}</span> : undefined}
        />
      }
    />
  )
}
