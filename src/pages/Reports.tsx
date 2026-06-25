import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { subscribeToCheckins } from '../firebase/reports'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import type { CheckinLog } from '../types'
import { RSVP_LABELS } from '../types'
import { IconCheck, IconCornerUpLeft } from '../components/Icons'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { LoadingInline } from '../components/LoadingInline'

export function Reports() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, guests, loading, guestsLoading } = useEvent(eventId)
  const [checkins, setCheckins] = useState<CheckinLog[]>([])
  const [checkinsLoading, setCheckinsLoading] = useState(true)

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
  if (!event) return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>
  if (user && event.ownerId !== user.uid) {
    return <p className="text-center text-gray-500 mt-16">No tienes acceso a este evento.</p>
  }
  if (event.plan !== 'premium') {
    return <Navigate to={`/events/${event.id}`} replace />
  }

  const attendanceRate = event.guestCount > 0 ? Math.round((event.checkedInCount / event.guestCount) * 100) : 0
  const pending = guests.filter((g) => g.status === 'invited')
  const rsvpYes = guests.filter((g) => g.rsvpStatus === 'yes').length
  const rsvpNo = guests.filter((g) => g.rsvpStatus === 'no').length
  const rsvpPending = guests.filter((g) => g.rsvpStatus === 'pending').length

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
    const rows = [['Invitado', 'Apellido', 'Estado', 'Hora de ingreso']]
    for (const guest of guests) {
      rows.push([
        guest.name,
        guest.lastName || '',
        guest.status === 'checked_in' ? 'Confirmado' : 'Pendiente',
        guest.checkedInAt ? new Date(guest.checkedInAt).toLocaleString() : '',
      ])
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${event!.name.replace(/\s+/g, '_')}_reporte.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const content = (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500">{event.name}</p>
        </div>
        <Link to={`/events/${event.id}`} className="text-sm text-primary font-medium">
          Volver al evento
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <Stat label="Invitados" value={event.guestCount} />
        <Stat label="Confirmados" value={event.checkedInCount} color="text-green-600" />
        <Stat label="Pendientes" value={pending.length} color="text-gray-400" />
        <Stat label="Asistencia" value={`${attendanceRate}%`} />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Asistirán" value={rsvpYes} color="text-primary" />
        <Stat label="No asistirán" value={rsvpNo} color="text-gray-400" />
        <Stat label="Sin responder" value={rsvpPending} color="text-gray-400" />
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <h2 className="font-medium text-gray-900 mb-3">Llegadas por hora</h2>
        {checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : hourEntries.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay check-ins registrados.</p>
        ) : (
          <div className="space-y-2">
            {hourEntries.map(([hour, count]) => (
              <div key={hour} className="flex items-center gap-2 text-sm">
                <span className="w-12 text-gray-500">{hour}</span>
                <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary rounded-full"
                    style={{ width: `${(count / maxHourCount) * 100}%` }}
                  />
                </div>
                <span className="w-8 text-right text-gray-700">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Detalle por invitado</h2>
          <button onClick={exportCsv} className="text-sm text-primary font-medium">
            Exportar CSV
          </button>
        </div>
        {guestsLoading && <LoadingInline label="Cargando asistentes…" />}
        <div className="divide-y divide-gray-100">
          {!guestsLoading && guests.map((guest) => (
            <div key={guest.id} className="flex items-center justify-between py-2 text-sm gap-2">
              <span className="text-gray-900">
                {guest.name} {guest.lastName}
                {guest.companions.length > 0 && <span className="text-gray-400"> +{guest.companions.length}</span>}
              </span>
              <span className="text-gray-400 text-xs">{RSVP_LABELS[guest.rsvpStatus]}</span>
              <span className="text-gray-500 text-right">
                {guest.status === 'checked_in' && guest.checkedInAt ? (
                  <>
                    Entró {new Date(guest.checkedInAt).toLocaleTimeString()}
                    {guest.checkedOutAt && <> · Salió {new Date(guest.checkedOutAt).toLocaleTimeString()}</>}
                  </>
                ) : (
                  'Pendiente'
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <h2 className="font-medium text-gray-900 mb-3">Línea de tiempo</h2>
        {checkinsLoading ? (
          <LoadingInline label="Cargando asistentes…" />
        ) : checkins.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay check-ins registrados.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {checkins.map((c) => (
              <li key={c.id} className="flex justify-between text-gray-700">
                <span className="inline-flex items-center gap-1.5">
                  {c.type === 'check_out' ? (
                    <IconCornerUpLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                  ) : (
                    <IconCheck className="w-3.5 h-3.5 text-green-600 shrink-0" />
                  )}
                  {c.guestName}
                  {c.scannedByEmail && <span className="text-gray-400"> · {c.scannedByEmail}</span>}
                </span>
                <span className="text-gray-400">{new Date(c.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )

  return event.templateId === 'cowboy' || event.templateId === 'graduation' ? (
    <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="max-w-3xl mx-auto px-4 py-8">
      {content}
    </InvitationThemeRoot>
  ) : (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="invite-stat-card border border-gray-200 rounded-lg p-3 bg-white text-center">
      <p className={`text-2xl font-semibold ${color || 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
