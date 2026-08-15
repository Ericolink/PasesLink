import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useEventOnly } from '../hooks/useEventOnly'
import { getPaymentMethodBreakdown } from '../firebase/paymentBreakdown'
import { PAYMENT_METHOD_LABELS } from '../utils/paymentMethods'
import type { PaymentMethod } from '../types'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useEventDashboard } from '../hooks/useEventDashboard'
import { attendancePercent, paymentProgress } from '../utils/attendance'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { SkeletonBlock } from '../components/Skeleton'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { MetricTile } from '../components/MetricTile'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { HourlyArrivalsChart } from '../components/HourlyArrivalsChart'
import { Accordion, AccordionItem } from '../components/accessibility/AccessibleAccordion/Accordion'
import { DashboardHero } from '../components/EventDashboard/DashboardHero'
import { LiveArrivalsFeed } from '../components/EventDashboard/LiveArrivalsFeed'
import { GuestDetailPanel } from '../components/EventDashboard/GuestDetailPanel'
import { CheckinTimelinePanel } from '../components/EventDashboard/CheckinTimelinePanel'

function formatMinutesAgo(timestamp: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000))
  if (minutes < 1) return 'Hace instantes'
  if (minutes === 1) return 'Hace 1 minuto'
  return `Hace ${minutes} minutos`
}

// Dashboard fusionado — reemplaza las antiguas "Reportes" y "Anfitrión en
// Vivo" (ver App.tsx: /events/:eventId/live ahora redirige acá). El
// contenido se arma según getDashboardStage(event), no según qué pantalla
// era antes: una sola jerarquía que se adapta al momento del evento en vez
// de dos pantallas con métricas parcialmente duplicadas.
export function Reports() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  // useEventOnly (no useEvent): este dashboard no necesita una suscripción en
  // vivo a `guests` completa — el detalle por invitado se carga aparte, bajo
  // demanda, en GuestDetailPanel (ver auditoría F3).
  const { event, loading } = useEventOnly(eventId)
  const perms = useEventPermissions(event, user)
  const {
    stage, recentCheckins, rejected, vipCount, pendingCount, occupancyPercent,
    waitlist, lastCheckinAt, recentPaceCount,
  } = useEventDashboard(eventId, event, perms)

  // Desglose transferencia/efectivo — solo aporta algo con 2+ métodos
  // habilitados (con uno solo, el total ya cuenta todo). Agregación en vivo
  // (src/firebase/paymentBreakdown.ts), no un contador persistido — mismo
  // criterio que la analítica de plataforma del admin.
  const [paymentBreakdown, setPaymentBreakdown] = useState<Partial<Record<PaymentMethod, number | null>> | null>(null)
  const paymentMethodsKey = event?.paymentMethods?.join(',') || ''
  /* eslint-disable react-hooks/set-state-in-effect -- limpia el desglose previo al cambiar de evento/config antes de que llegue (o no) el nuevo fetch */
  useEffect(() => {
    if (!eventId || !event?.requiresPayment || event.paymentMethods.length < 2) {
      setPaymentBreakdown(null)
      return
    }
    let cancelled = false
    getPaymentMethodBreakdown(eventId, event.paymentMethods).then((result) => {
      if (!cancelled) setPaymentBreakdown(result)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- paymentMethodsKey resume el array (evita refetch por identidad nueva en cada render)
  }, [eventId, event?.requiresPayment, paymentMethodsKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  useDocumentTitle(event ? `${stage === 'live' ? 'En vivo' : 'Reportes'} · ${event.name}` : 'Reportes')
  useDashboardTheme(event?.templateId, event?.accentColor)

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <SkeletonBlock className="h-6 w-1/3 mb-2" />
        <SkeletonBlock className="h-4 w-1/4 mb-6" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
          <SkeletonBlock className="h-20 rounded-xl" />
        </div>
        <SkeletonBlock className="h-40 rounded-lg" />
      </div>
    )
  }
  if (!event) {
    return <ErrorFallbackCTA message="Evento no encontrado." />
  }
  const canSeeReports = perms.viewReports
  const canSeeLive = perms.viewLiveDashboard
  if (user && !canSeeReports && !canSeeLive) {
    return <ErrorFallbackCTA message="No tienes acceso a este evento." />
  }

  const totalPeople = event.peopleCount
  const rsvpYes = event.rsvpYesCount ?? 0
  const rsvpNo = event.rsvpNoCount ?? 0
  const rsvpPending = event.rsvpPendingCount ?? 0
  const totalCollected = (event.ticketPrice ?? 0) * (event.paidCount ?? 0)
  const attendedPercent = Math.round(attendancePercent(event.checkedInCount, totalPeople))
  const payment = paymentProgress(event)

  const paymentMethodTiles = payment && event.paymentMethods.length > 1 && paymentBreakdown
    ? event.paymentMethods.map((m) => (
      <MetricTile
        key={m}
        label={`Pagos por ${PAYMENT_METHOD_LABELS[m].toLowerCase()}`}
        value={paymentBreakdown[m] ?? '—'}
        accent="success"
      />
    ))
    : null

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      <ScreenHeader
        title={stage === 'live' ? 'En vivo' : 'Reportes'}
        subtitle={event.name}
        backTo={`/events/${event.id}`}
        templateId={event.templateId}
      />

      {/* ── Evento vacío: nadie se ha registrado todavía ── */}
      {stage === 'empty' && (
        canSeeReports ? (
          <DashboardHero
            tone="gray"
            title="Aún no tienes invitados registrados"
            subtitle={event.attendeeLimitEnabled
              ? `Capacidad del evento: ${event.capacity} personas.`
              : 'Comparte el enlace de invitación para empezar a recibir registros.'}
          />
        ) : (
          <DashboardHero tone="gray" title="Todavía no hay actividad de acceso" subtitle="Este panel se activa el día del evento." />
        )
      )}

      {/* ── Abierto a registros ── */}
      {stage === 'open' && (
        canSeeReports ? (
          <>
            <DashboardHero
              tone="primary"
              title={event.attendeeLimitEnabled
                ? `${Math.round(attendancePercent(totalPeople, event.capacity))}% de capacidad`
                : `${event.guestCount} invitados registrados`}
              subtitle={event.attendeeLimitEnabled
                ? `Quedan ${Math.max(0, event.capacity - totalPeople)} lugares disponibles.`
                : `${totalPeople} personas en total.`}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MetricTile label="Registrados" value={event.guestCount} sub={`${totalPeople} personas en total`} />
              {event.attendeeLimitEnabled && (
                <MetricTile label="Cupo" value={`${totalPeople} / ${event.capacity}`} accent="primary" />
              )}
              <MetricTile label="Asistirán" value={rsvpYes} accent="primary" />
              <MetricTile label="No asistirán" value={rsvpNo} />
              <MetricTile label="Sin responder" value={rsvpPending} />
              {payment && (
                <>
                  <MetricTile label={`Recaudado (${event.currency})`} value={totalCollected} accent="success" />
                  <MetricTile label="Personas pagadas" value={payment.paidPeople} accent="success" />
                  <MetricTile label="Personas pendientes" value={payment.pendingPeople} accent="warning" />
                  {paymentMethodTiles}
                </>
              )}
            </div>
            {waitlist.length > 0 && (
              <DashboardHero tone="warning" title={`${waitlist.length} en sala de espera`} subtitle="La sala de espera comenzó a utilizarse." />
            )}
          </>
        ) : (
          <DashboardHero tone="gray" title="Todavía no hay actividad de acceso" subtitle="Este panel se activa el día del evento." />
        )
      )}

      {/* ── Cupo alcanzado ── */}
      {stage === 'full' && (
        canSeeReports ? (
          <>
            <DashboardHero tone="warning" title="🔴 Tu evento está lleno" subtitle={`Capacidad utilizada: ${event.capacity} / ${event.capacity}.`}>
              {waitlist.length > 0 && <p className="text-sm font-semibold">{waitlist.length} personas esperando un lugar.</p>}
            </DashboardHero>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
              <MetricTile label="Registrados" value={event.guestCount} sub={`${totalPeople} personas`} />
              <MetricTile label="En espera" value={waitlist.length} accent="warning" />
              <MetricTile label="Capacidad utilizada" value="100%" accent="warning" />
            </div>
          </>
        ) : (
          <DashboardHero tone="gray" title="Todavía no hay actividad de acceso" subtitle="Este panel se activa el día del evento." />
        )
      )}

      {/* ── Día del evento, antes del primer check-in ── */}
      {stage === 'waiting_first_checkin' && (
        canSeeLive ? (
          <DashboardHero
            tone="primary"
            title="Esperando el primer ingreso"
            subtitle={`${totalPeople} personas esperadas · escanea el primer pase para comenzar.`}
          />
        ) : canSeeReports ? (
          <DashboardHero tone="gray" title="El evento ya comenzó" subtitle="Todavía no hay check-ins registrados." />
        ) : null
      )}

      {/* ── En vivo ── */}
      {stage === 'live' && (
        canSeeLive ? (
          <>
            <div className="mb-5">
              <AttendanceProgressBar
                present={event.occupancyCount}
                expected={event.capacity || event.peopleCount}
                unitLabel="dentro"
                variant="glow"
                className="text-base sm:text-lg"
                subtitle={
                  (event.capacity || event.peopleCount) - event.occupancyCount > 0
                    ? `${(event.capacity || event.peopleCount) - event.occupancyCount} lugares libres.`
                    : 'Capacidad completa.'
                }
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-5">
              <MetricTile label="Ocupación" value={occupancyPercent !== null ? `${occupancyPercent}%` : event.occupancyCount} accent="primary" />
              <MetricTile label="Check-ins totales" value={event.checkedInCount} accent="success" />
              <MetricTile label="Pendientes" value={pendingCount} accent="warning" />
              {vipCount !== null && <MetricTile label="VIP" value={vipCount} accent="gray" />}
              {rejected.length > 0 && <MetricTile label="Rechazados" value={rejected.length} accent="warning" />}
              {lastCheckinAt !== null && <MetricTile label="Último ingreso" value={formatMinutesAgo(lastCheckinAt)} />}
              <MetricTile label="Ritmo de ingreso" value={recentPaceCount} sub="check-ins en los últimos 10 min" />
            </div>
            <div className="mb-5">
              <LiveArrivalsFeed recentCheckins={recentCheckins} />
            </div>
          </>
        ) : canSeeReports ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
            <MetricTile
              label="Escaneados"
              value={event.checkedInCount}
              sub={totalPeople > 0 ? `${attendedPercent}% del total` : undefined}
              accent="success"
            />
            <MetricTile label="Dentro ahora" value={event.occupancyCount} accent="primary" />
            <MetricTile label="Pendientes" value={pendingCount} />
          </div>
        ) : null
      )}

      {/* ── Finalizado ── */}
      {stage === 'ended' && (
        canSeeReports ? (
          <>
            <DashboardHero tone="gray" title="Resumen final" subtitle={`${attendedPercent}% de asistencia.`} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
              <MetricTile label="Registrados" value={event.guestCount} sub={`${totalPeople} personas`} />
              <MetricTile label="Asistieron" value={event.checkedInCount} accent="success" />
              <MetricTile label="No asistieron" value={pendingCount} />
              <MetricTile label="Acompañantes" value={Math.max(0, totalPeople - event.guestCount)} />
              {event.attendeeLimitEnabled && (
                <MetricTile label="Capacidad utilizada" value={`${Math.round(attendancePercent(totalPeople, event.capacity))}%`} />
              )}
              {payment && (
                <>
                  <MetricTile label={`Recaudado (${event.currency})`} value={totalCollected} accent="success" />
                  <MetricTile label="Personas pagadas" value={payment.paidPeople} accent="success" />
                  <MetricTile label="Personas pendientes" value={payment.pendingPeople} accent="warning" />
                  {paymentMethodTiles}
                </>
              )}
            </div>
          </>
        ) : (
          <DashboardHero tone="gray" title="El evento terminó" />
        )
      )}

      {/* ── Llegadas por hora: solo tiene sentido una vez que hay check-ins,
          y es contenido de reportes (mismo permiso que antes tenía Reportes,
          Anfitrión en Vivo nunca lo mostró). ── */}
      {canSeeReports && event.checkedInCount > 0 && (
        <HourlyArrivalsChart checkinsByHour={event.checkinsByHour ?? {}} />
      )}

      {/* ── Consulta bajo demanda: no se lee nada de esto hasta que el
          organizador expande la sección (ver GuestDetailPanel/
          CheckinTimelinePanel). ── */}
      {canSeeReports && (
        <Accordion className="space-y-1">
          <AccordionItem id="detail" header={<span className="font-medium text-gray-900 dark:text-white">Detalle e invitados</span>}>
            <div className="pb-4">
              <GuestDetailPanel eventId={event.id} event={event} canExport={perms.exportLists} />
            </div>
          </AccordionItem>
          <AccordionItem id="timeline" header={<span className="font-medium text-gray-900 dark:text-white">Línea de tiempo</span>}>
            <div className="pb-4">
              <CheckinTimelinePanel eventId={event.id} />
            </div>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  )
}
