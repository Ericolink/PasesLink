import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { subscribeToAllEvents, subscribeToAllUsers, type AdminUser } from '../firebase/admin'
import { deleteEvent, setEventPaymentStatus, setEventStatus } from '../firebase/events'
import type { EventData, EventStatus, PaymentStatus, Plan } from '../types'
import { PLAN_LABELS } from '../types'
import { PlanBadge } from '../components/PlanBadge'

const PLAN_PRICES: Record<Plan, number> = {
  basic: 9,
  premium: 19,
}

const PAYMENT_LABELS: Record<PaymentStatus, string> = {
  pending: 'Pendiente',
  paid: 'Pagado',
  free_trial: 'Prueba gratis',
}

const PAYMENT_STYLES: Record<PaymentStatus, string> = {
  pending: 'bg-amber-100 text-amber-700',
  paid: 'bg-green-100 text-green-700',
  free_trial: 'bg-blue-100 text-blue-700',
}

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

export function AdminDashboard() {
  const [events, setEvents] = useState<EventData[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubEvents = subscribeToAllEvents((data) => {
      setEvents(data)
      setLoading(false)
    })
    const unsubUsers = subscribeToAllUsers(setUsers)
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
  const pendingPayments = events.filter((e) => e.paymentStatus === 'pending').length
  const revenue = events
    .filter((e) => e.paymentStatus === 'paid')
    .reduce((sum, e) => sum + PLAN_PRICES[e.plan], 0)

  async function togglePayment(event: EventData) {
    const next: PaymentStatus = event.paymentStatus === 'paid' ? 'pending' : 'paid'
    await setEventPaymentStatus(event.id, next)
  }

  async function handleStatusChange(eventId: string, status: EventStatus) {
    await setEventStatus(eventId, status)
  }

  async function handleDelete(event: EventData) {
    const confirmed = window.confirm(
      `¿Eliminar "${event.name}" definitivamente? Se borrarán todos sus invitados y el historial de check-ins. Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return
    await deleteEvent(event.id)
  }

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-gray-900 mb-6">Panel de administración</h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        <Stat label="Clientes" value={users.length} />
        <Stat label="Eventos activos" value={activeEvents} />
        <Stat label="Pagos pendientes" value={pendingPayments} color="text-amber-600" />
        <Stat label="Ingresos estimados" value={`$${revenue}`} color="text-green-600" />
      </div>

      <h2 className="text-lg font-medium text-gray-900 mb-3">Eventos</h2>
      <div className="border border-gray-200 rounded-lg bg-white overflow-x-auto mb-8">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 font-medium">Evento</th>
              <th className="px-4 py-2 font-medium">Organizador</th>
              <th className="px-4 py-2 font-medium">Plan</th>
              <th className="px-4 py-2 font-medium">Pago</th>
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
                  <PlanBadge plan={event.plan} />
                </td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => togglePayment(event)}
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${PAYMENT_STYLES[event.paymentStatus]}`}
                  >
                    {PAYMENT_LABELS[event.paymentStatus]}
                  </button>
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
                    onClick={() => handleDelete(event)}
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
      <p className="text-xs text-gray-400 mt-6 text-center">
        Ingresos estimados según plan ({PLAN_LABELS.basic}: ${PLAN_PRICES.basic} · {PLAN_LABELS.premium}: $
        {PLAN_PRICES.premium}) y eventos marcados como pagados.
      </p>
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
