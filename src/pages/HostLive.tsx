import { useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import confetti from 'canvas-confetti'
import { useHostLiveDashboard } from '../hooks/useHostLiveDashboard'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { LoadingInline } from '../components/LoadingInline'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { MetricTile } from '../components/MetricTile'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { IconArrowLeft, IconCheckCircle, IconXCircle } from '../components/accessibility/AccessibleIcon'

// Ventana de coalescido: si llegan varios check-ins dentro de este margen
// (puerta muy activa), se dispara UN solo burst de confeti en vez de uno por
// invitado — evita degradar rendimiento/saturar la pantalla en un evento
// grande con ingreso masivo simultáneo.
const CONFETTI_COALESCE_MS = 800

export function HostLive() {
  const { eventId } = useParams<{ eventId: string }>()
  const { event, loading, error, recentCheckins, arrivals, rejected, vipCount, pendingCount, occupancyPercent } =
    useHostLiveDashboard(eventId)
  useDocumentTitle(event ? `Anfitrión en Vivo · ${event.name}` : 'Anfitrión en Vivo')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const prefersReducedMotion = usePrefersReducedMotion()

  const seenArrivalIdsRef = useRef<Set<string> | null>(null)
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (seenArrivalIdsRef.current === null) {
      // Primera carga: no dispara confeti retroactivo por check-ins previos.
      seenArrivalIdsRef.current = new Set(arrivals.map((a) => a.id))
      return
    }
    const seen = seenArrivalIdsRef.current
    const hasNew = arrivals.some((a) => !seen.has(a.id))
    arrivals.forEach((a) => seen.add(a.id))
    if (hasNew && !prefersReducedMotion) {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
      burstTimerRef.current = setTimeout(() => {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } })
        burstTimerRef.current = null
      }, CONFETTI_COALESCE_MS)
    }
  }, [arrivals, prefersReducedMotion])

  useEffect(() => () => {
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
  }, [])

  if (loading) return <LoadingInline label="Cargando…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  return (
    <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
      <div className="flex items-center justify-between mb-5">
        <Link
          to={`/events/${eventId}`}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white min-h-11"
        >
          <IconArrowLeft className="w-4 h-4" /> Volver
        </Link>
        <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white text-center truncate px-2">
          {event.name}
        </h1>
        <div className="w-16" aria-hidden="true" />
      </div>

      <div className="mb-6">
        <AttendanceProgressBar
          present={event.occupancyCount}
          expected={event.capacity || event.peopleCount}
          unitLabel="dentro"
          variant="glow"
          className="text-base sm:text-lg"
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <MetricTile label="Ocupación" value={occupancyPercent !== null ? `${occupancyPercent}%` : event.occupancyCount} accent="primary" />
        <MetricTile label="Check-ins totales" value={event.checkedInCount} accent="success" />
        <MetricTile label="Pendientes" value={pendingCount} accent="warning" />
        {vipCount !== null && <MetricTile label="VIP" value={vipCount} accent="gray" />}
        {rejected.length > 0 && <MetricTile label="Rechazados" value={rejected.length} accent="warning" />}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
        <h2 className="text-sm font-semibold text-gray-900 dark:text-white px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          Ingresos recientes
        </h2>
        {recentCheckins.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Todavía no hay movimiento.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[50vh] overflow-y-auto">
            {recentCheckins.slice(0, 15).map((entry) => (
              <li key={entry.id} className="flex items-center gap-3 px-4 py-3 animate-fade-in">
                {entry.type === 'entry_blocked' ? (
                  <IconXCircle className="w-5 h-5 text-red-500 shrink-0" />
                ) : (
                  <IconCheckCircle className="w-5 h-5 text-success-ink shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.guestName}</p>
                  <p className="text-xs text-gray-400">
                    {entry.type === 'entry_blocked' ? 'Ingreso rechazado' : entry.reentry ? 'Reingreso' : 'Ingresó'}
                  </p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                  {new Date(entry.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
