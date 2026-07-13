import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { subscribeToCheckins } from '../firebase/reports'
import { partySize } from '../firebase/guests'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useGuestStats } from '../hooks/useGuestStats'
import { attendancePercent } from '../utils/attendance'
import type { CheckinLog } from '../types'
import { PAYMENT_STATUS_LABELS, RSVP_LABELS } from '../types'
import { IconCheck, IconCornerUpLeft } from '../components/Icons'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { LoadingInline } from '../components/LoadingInline'
import { ScreenHeader } from '../components/ScreenHeader'
import { StatCard } from '../components/StatCard'
import { EventAnalytics } from '../components/EventAnalytics'

export function Reports() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, guests, loading, guestsLoading } = useEvent(eventId)
  useDocumentTitle(event ? `Reportes · ${event.name}` : 'Reportes')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const [checkins, setCheckins] = useState<CheckinLog[]>([])
  const [checkinsLoading, setCheckinsLoading] = useState(true)

  // Mismo cálculo que usaba EventDetail.tsx antes del rediseño dashboard/
  // reportes — se llama sin condicionales (regla de hooks) aunque `event`
  // todavía pueda ser null en el primer render.
  const { totalPeople, totalCollected, rsvpYes, rsvpNo, rsvpPending } = useGuestStats(guests, event?.ticketPrice ?? 0)
  const perms = useEventPermissions(event, user)

  // Resetea el loading al cambiar de evento, antes de (re)suscribirse —
  // necesario para no mostrar datos del evento anterior como si fueran del nuevo.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!eventId) return
    setCheckinsLoading(true)
    return subscribeToCheckins(eventId, (data) => {
      setCheckins(data)
      setCheckinsLoading(false)
    })
  }, [eventId])
  /* eslint-enable react-hooks/set-state-in-effect */

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  if (!event) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">Evento no encontrado.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }
  if (user && !perms.viewReports) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">No tienes acceso a este evento.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }

  const checkIns = checkins.filter((c) => c.type === 'check_in')
  const hourCounts = new Map<string, number>()
  for (const c of checkIns) {
    const hour = new Date(c.timestamp).getHours()
    const label = `${hour.toString().padStart(2, '0')}:00`
    hourCounts.set(label, (hourCounts.get(label) || 0) + 1)
  }
  const hourEntries = Array.from(hourCounts.entries()).sort(([a], [b]) => a.localeCompare(b))
  const maxHourCount = Math.max(1, ...hourEntries.map(([, count]) => count))

  function exportCsv() {
    // Columna de pago solo si el evento cobra entrada — en un evento
    // gratuito paymentStatus siempre es 'unpaid' (no significa nada), no
    // vale la pena mostrarlo.
    const headers = ['Invitado', 'Apellido', 'Estado', 'Hora de ingreso']
    if (event!.requiresPayment) headers.push('Pago')
    const rows = [headers]
    for (const guest of guests) {
      const row = [
        guest.name,
        guest.lastName || '',
        guest.status === 'checked_in' ? 'Confirmado' : 'Pendiente',
        guest.checkedInAt ? new Date(guest.checkedInAt).toLocaleString() : '',
      ]
      if (event!.requiresPayment) row.push(PAYMENT_STATUS_LABELS[guest.paymentStatus])
      rows.push(row)
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    // BOM UTF-8: sin esto, Excel (el consumidor más común de este CSV) asume
    // Latin-1/ANSI al abrirlo y rompe tildes/ñ (ej. "María" → "MarÃ­a").
    const blob = new Blob([String.fromCharCode(0xfeff) + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event!.name.replace(/\s+/g, '_')}_reporte.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const content = (
    <>
      <ScreenHeader title="Reportes" backTo={`/events/${event.id}`} templateId={event.templateId} />
      <p className="text-sm text-gray-500 dark:text-gray-400 -mt-2 mb-6">{event.name}</p>

      {/* ── ESTADÍSTICAS PRINCIPALES ── (extraído de EventDetail.tsx, misma
          fórmula de cada valor, solo que ahora vive acá) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <StatCard
          label="Registrados"
          value={event.guestCount}
          sub={`${totalPeople} personas en total`}
        />
        <StatCard
          label="Escaneados"
          value={event.checkedInCount}
          // % sobre personas totales (totalPeople, ya suma partySize de cada
          // invitado/familia), no sobre guestCount (cantidad de invitaciones/
          // documentos) — checkedInCount es un conteo de PERSONAS, dividirlo
          // por la cantidad de invitaciones daba porcentajes >100% en cuanto
          // había acompañantes o familias con varios integrantes.
          sub={totalPeople > 0
            ? `${Math.round(attendancePercent(event.checkedInCount, totalPeople))}% del total`
            : undefined}
          valueClass="text-green-600 dark:text-green-400"
        />
        {event.requiresPayment && (
          <StatCard
            label="Pagados"
            value={event.paidCount}
            sub={totalPeople > 0
              ? `${Math.round(attendancePercent(event.paidCount, totalPeople))}% del total`
              : undefined}
            valueClass="text-emerald-600 dark:text-emerald-400"
          />
        )}
        <StatCard label="Dentro ahora" value={event.occupancyCount} valueClass="text-primary" />
        <StatCard label="Pendientes" value={Math.max(0, totalPeople - event.checkedInCount)} />
      </div>

      {/* Cupo recomendado (informativo, nunca bloquea nuevos registros) */}
      {event.capacity > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-6">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
            <span>Cupo recomendado del evento</span>
            <span className="font-semibold">{totalPeople} / {event.capacity}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${attendancePercent(totalPeople, event.capacity)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── CONFIRMACIONES Y PAGOS ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatCard label="Asistirán" value={rsvpYes} valueClass="text-primary" />
        <StatCard label="No asistirán" value={rsvpNo} />
        <StatCard label="Sin responder" value={rsvpPending} />
        {event.requiresPayment && (
          <StatCard
            label={`Recaudado (${event.currency})`}
            value={totalCollected}
            valueClass="text-green-600 dark:text-green-400"
          />
        )}
      </div>

      {/* ── ACTIVIDAD DE LLEGADA ── (extraído de EventDetail.tsx, mismo
          componente reutilizado, sin cambios en su lógica interna) */}
      <EventAnalytics guests={guests} loading={guestsLoading} />

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <h2 className="font-medium text-gray-900 dark:text-white mb-3">Llegadas por hora</h2>
        {checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : hourEntries.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay check-ins registrados.</p>
        ) : (
          <div className="space-y-2">
            {hourEntries.map(([hour, count]) => (
              <div key={hour} className="flex items-center gap-2 text-sm">
                <span className="w-12 text-gray-500 dark:text-gray-400">{hour}</span>
                <div className="flex-1 h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(count / maxHourCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-700 dark:text-gray-300">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900 dark:text-white">Detalle por invitado</h2>
          {perms.exportLists && (
            <button onClick={exportCsv} className="text-sm text-primary font-medium">
              Exportar CSV
            </button>
          )}
        </div>
        {guestsLoading && <LoadingInline label="Cargando asistentes…" />}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {/* flex-wrap + el span de estado en w-full: cuando el nombre es
              largo y no entran los 3 en una fila, el estado pasa solo a su
              propia línea en vez de superponerse o forzar scroll horizontal
              — en pantallas con más ancho (sm+), si entran los tres en una
              fila, se acomodan igual que antes (w-auto). */}
          {!guestsLoading && guests.map((guest) => (
            <div key={guest.id} className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5 py-2 text-sm">
              <span className="text-gray-900 dark:text-white min-w-0 flex-1 break-words">
                {guest.isGroup ? (
                  <>
                    {guest.name}
                    <span className="text-gray-400 dark:text-gray-500"> · {partySize(guest)} integrantes</span>
                  </>
                ) : (
                  <>
                    {guest.name} {guest.lastName}
                    {guest.companions.length > 0 && <span className="text-gray-400 dark:text-gray-500"> +{guest.companions.length}</span>}
                  </>
                )}
              </span>
              <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">{RSVP_LABELS[guest.rsvpStatus]}</span>
              <span className="text-gray-500 dark:text-gray-400 text-xs w-full sm:w-auto sm:text-right shrink-0">
                {guest.status === 'checked_in' && guest.checkedInAt ? (
                  <>
                    Entró {new Date(guest.checkedInAt).toLocaleTimeString()}
                    {guest.checkedOutAt && (
                      <> · {guest.exitType === 'final' ? 'Salió (definitivo)' : 'Salió (temporal)'} {new Date(guest.checkedOutAt).toLocaleTimeString()}</>
                    )}
                  </>
                ) : (
                  'Pendiente'
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <h2 className="font-medium text-gray-900 dark:text-white mb-3">Línea de tiempo</h2>
        {checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : checkins.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">Aún no hay check-ins registrados.</p>
        ) : (
          <ul className="text-sm space-y-1.5">
            {/* min-w-0 + break-words en el texto: nombres/emails largos
                pasan a una segunda línea en vez de superponerse con la
                hora — la hora vive en su propio span shrink-0, así que
                nunca se comprime ni queda tapada. */}
            {checkins.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-2 text-gray-700 dark:text-gray-300">
                <span className="inline-flex items-start gap-1.5 min-w-0 flex-1">
                  {c.type === 'check_out' ? (
                    <IconCornerUpLeft className="w-3.5 h-3.5 mt-0.5 text-gray-400 dark:text-gray-500 shrink-0" />
                  ) : (
                    <IconCheck className="w-3.5 h-3.5 mt-0.5 text-green-600 dark:text-green-400 shrink-0" />
                  )}
                  <span className="break-words">
                    {c.guestName}
                    {c.type === 'check_out' && (
                      <span className="text-gray-400 dark:text-gray-500"> · {c.exitKind === 'final' ? 'salida definitiva' : 'salida temporal'}</span>
                    )}
                    {c.type === 'check_in' && c.reentry && <span className="text-gray-400 dark:text-gray-500"> · reingreso</span>}
                    {c.scannedByEmail && <span className="text-gray-400 dark:text-gray-500"> · {c.scannedByEmail}</span>}
                  </span>
                </span>
                <span className="text-gray-400 dark:text-gray-500 shrink-0">{new Date(c.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )

  return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
}
