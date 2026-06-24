import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribeToAllEvents, subscribeToAllUsers, type AdminUser } from '../firebase/admin'
import { deleteEvent, setEventStatus } from '../firebase/events'
import type { EventData, EventStatus } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

export function AdminDashboard() {
  const [events, setEvents] = useState<EventData[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [deletingEvent, setDeletingEvent] = useState<EventData | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionError, setActionError] = useState('')

  useEffect(() => {
    function handleLoadError(err: Error) {
      console.error('Error loading admin data:', err)
      setLoadError('No se pudieron cargar los datos del panel. Verifica tu conexión o tus permisos.')
      setLoading(false)
    }
    const unsubEvents = subscribeToAllEvents((data) => {
      setEvents(data)
      setLoading(false)
    }, handleLoadError)
    const unsubUsers = subscribeToAllUsers(setUsers, handleLoadError)
    return () => {
      unsubEvents()
      unsubUsers()
    }
  }, [])

  const usersById = new Map(users.map((u) => [u.id, u]))
  const eventCountByUser = new Map<string, number>()
  for (const event of events) {
    eventCountByUser.set(event.ownerId, (eventCountByUser.get(event.ownerId) || 0) + 1)
  }

  const activeEvents = events.filter((e) => e.status === 'active').length

  async function handleStatusChange(eventId: string, status: EventStatus) {
    setActionError('')
    try {
      await setEventStatus(eventId, status)
    } catch (err) {
      console.error('Error updating event status:', err)
      setActionError('No se pudo actualizar el estado del evento. Intenta de nuevo.')
    }
  }

  async function confirmDeleteEvent() {
    if (!deletingEvent) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteEvent(deletingEvent.id)
    } catch (err) {
      console.error('Error deleting event:', err)
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setDeleting(false)
      setDeletingEvent(null)
    }
  }

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  if (loadError) return <p className="text-center text-red-500 mt-16">{loadError}</p>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 animate-fade-in">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Panel de administración</h1>

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        <Stat label="Clientes" value={users.length} />
        <Stat label="Eventos activos" value={activeEvents} />
        <Stat label="Eventos totales" value={events.length} />
      </div>

      <h2 className="text-lg font-medium text-gray-900 mb-3">Eventos</h2>
      <div className="border border-gray-200 rounded-lg bg-white overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Evento</th>
              <th className="px-4 py-2 font-medium">Organizador</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2 font-medium">Invitados</th>
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {events.map((event) => (
              <tr key={event.id}>
                <td className="px-4 py-2">
                  <Link to={`/events/${event.id}`} className="text-primary font-medium hover:underline">
                    {event.name}
                  </Link>
                  <div className="text-xs text-gray-400">{event.date}</div>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {usersById.get(event.ownerId)?.email || event.ownerId}
                </td>
                <td className="px-4 py-2">
                  <select
                    value={event.status}
                    onChange={(e) => handleStatusChange(event.id, e.target.value as EventStatus)}
                    className="border border-gray-200 rounded-md text-xs px-1.5 py-1"
                  >
                    {Object.entries(STATUS_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-2 text-gray-600">
                  {event.checkedInCount} / {event.guestCount}
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => setDeletingEvent(event)}
                    className="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {events.length === 0 && <p className="text-center text-gray-500 py-6">Aún no hay eventos.</p>}
      </div>

      <h2 className="text-lg font-medium text-gray-900 mb-3">Clientes</h2>
      <div className="border border-gray-200 rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Email</th>
              <th className="px-4 py-2 font-medium">Nombre</th>
              <th className="px-4 py-2 font-medium">Eventos</th>
              <th className="px-4 py-2 font-medium">Registrado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="px-4 py-2 text-gray-900">{u.email || u.id}</td>
                <td className="px-4 py-2 text-gray-600">{u.displayName || '—'}</td>
                <td className="px-4 py-2 text-gray-600">{eventCountByUser.get(u.id) || 0}</td>
                <td className="px-4 py-2 text-gray-400">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {users.length === 0 && <p className="text-center text-gray-500 py-6">Aún no hay clientes.</p>}
      </div>
      <ConfirmDialog
        open={!!deletingEvent}
        title="Eliminar evento"
        message={`¿Eliminar "${deletingEvent?.name}" definitivamente? Se borrarán todos sus invitados y el historial de check-ins. Esta acción no se puede deshacer.`}
        confirmLabel={deleting ? 'Eliminando…' : 'Eliminar'}
        danger
        onConfirm={confirmDeleteEvent}
        onCancel={() => setDeletingEvent(null)}
      />
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
