import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore'
import { db } from '../firebase/config'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import type { CheckinLog } from '../types'

export function Reports() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, guests, loading } = useEvent(eventId)
  const [checkins, setCheckins] = useState<CheckinLog[]>([])

  useEffect(() => {
    if (!eventId) return
    const q = query(collection(db, 'events', eventId, 'checkins'), orderBy('timestamp', 'asc'))
    return onSnapshot(q, (snapshot) => {
      setCheckins(
        snapshot.docs.map((d) => {
          const data = d.data()
          return {
            id: d.id,
            guestId: data.guestId,
            guestName: data.guestName,
            scannedBy: data.scannedBy,
            timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : 0,
          }
        }),
      )
    })
  }, [eventId])

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>
  if (!event) return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>
  if (user && event.ownerId !== user.uid) {
    return <p className="text-center text-gray-500 mt-16">No tienes acceso a este evento.</p>
  }
  if (event.plan !== 'premium') {
    return <Navigate to={`/events/${event.id}`} replace />
  }

  const attendanceRate = event.guestCount > 0 ? Math.round((event.checkedInCount / event.guestCount) * 100) : 0
  const pending = guests.filter((g) => g.status === 'invited')

  function exportCsv() {
    const rows = [['Invitado', 'Email', 'Estado', 'Hora de ingreso']]
    for (const guest of guests) {
      rows.push([
        guest.name,
        guest.email || '',
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

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Reportes</h1>
          <p className="text-sm text-gray-500">{event.name}</p>
        </div>
        <Link to={`/events/${event.id}`} className="text-sm text-primary font-medium">
          Volver al evento
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Stat label="Invitados" value={event.guestCount} />
        <Stat label="Confirmados" value={event.checkedInCount} color="text-green-600" />
        <Stat label="Pendientes" value={pending.length} color="text-gray-400" />
        <Stat label="Asistencia" value={`${attendanceRate}%`} />
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-medium text-gray-900">Detalle por invitado</h2>
          <button onClick={exportCsv} className="text-sm text-primary font-medium">
            Exportar CSV
          </button>
        </div>
        <div className="divide-y divide-gray-100">
          {guests.map((guest) => (
            <div key={guest.id} className="flex items-center justify-between py-2 text-sm">
              <span className="text-gray-900">{guest.name}</span>
              <span className="text-gray-500">
                {guest.status === 'checked_in' && guest.checkedInAt
                  ? new Date(guest.checkedInAt).toLocaleTimeString()
                  : 'Pendiente'}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <h2 className="font-medium text-gray-900 mb-3">Línea de tiempo de llegadas</h2>
        {checkins.length === 0 ? (
          <p className="text-sm text-gray-500">Aún no hay check-ins registrados.</p>
        ) : (
          <ul className="text-sm space-y-1">
            {checkins.map((c) => (
              <li key={c.id} className="flex justify-between text-gray-700">
                <span>{c.guestName}</span>
                <span className="text-gray-400">{new Date(c.timestamp).toLocaleTimeString()}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value, color }: { label: string; value: number | string; color?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white text-center">
      <p className={`text-2xl font-semibold ${color || 'text-gray-900'}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}
