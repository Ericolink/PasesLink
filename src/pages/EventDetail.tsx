import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import { useCheckinToast } from '../hooks/useCheckinToast'
import { deleteEvent, setEventStatus } from '../firebase/events'
import { exportGuestPassesPdf } from '../utils/exportPdf'
import { PlanBadge } from '../components/PlanBadge'
import { GuestAddForm } from '../components/GuestAddForm'
import { GuestList } from '../components/GuestList'
import { WelcomeMessageEditor } from '../components/WelcomeMessageEditor'
import { BrandingEditor } from '../components/BrandingEditor'
import {
  IconArrowLeft,
  IconCheckCircle,
  IconClock,
  IconHome,
  IconThumbsDown,
  IconThumbsUp,
  IconUsers,
} from '../components/Icons'

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { event, guests, loading } = useEvent(eventId)
  const [exporting, setExporting] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [search, setSearch] = useState('')
  const checkinToast = useCheckinToast(eventId)

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>
  if (!event) return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>
  if (user && event.ownerId !== user.uid) {
    return <p className="text-center text-gray-500 mt-16">No tienes acceso a este evento.</p>
  }
  if (event.paymentStatus !== 'paid') {
    return <Navigate to={`/events/${event.id}/checkout`} replace />
  }

  async function handleExport() {
    setExporting(true)
    try {
      await exportGuestPassesPdf(event!, guests)
    } finally {
      setExporting(false)
    }
  }

  async function handleStatusChange(status: 'cancelled' | 'archived' | 'active') {
    if (!eventId) return
    setUpdatingStatus(true)
    try {
      await setEventStatus(eventId, status)
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleDelete() {
    if (!eventId) return
    const confirmed = window.confirm(
      `¿Eliminar "${event?.name}" definitivamente? Se borrarán todos sus invitados y el historial de check-ins. Esta acción no se puede deshacer.`,
    )
    if (!confirmed) return
    setDeleting(true)
    try {
      await deleteEvent(eventId)
      navigate('/dashboard')
    } finally {
      setDeleting(false)
    }
  }

  const totalPeople = guests.reduce((sum, g) => sum + 1 + g.companions, 0)
  const insideGuests = guests.filter((g) => g.status === 'checked_in' && !g.checkedOutAt)
  const peopleInside = insideGuests.reduce((sum, g) => sum + 1 + g.companions, 0)
  const rsvpYes = guests.filter((g) => g.rsvpStatus === 'yes').length
  const rsvpNo = guests.filter((g) => g.rsvpStatus === 'no').length

  const filteredGuests = guests.filter((g) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return g.name.toLowerCase().includes(term) || (g.email || '').toLowerCase().includes(term)
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">
      {checkinToast && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-white text-sm rounded-lg shadow-lg px-4 py-2.5 animate-pulse flex items-center gap-2">
          <IconCheckCircle className="w-4 h-4" /> {checkinToast}
        </div>
      )}
      <Link
        to="/dashboard"
        className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1 mb-3"
      >
        <IconArrowLeft className="w-4 h-4" /> Mis eventos
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-semibold text-gray-900">{event.name}</h1>
            <PlanBadge plan={event.plan} />
          </div>
          <p className="text-sm text-gray-500">
            {event.date} · {event.location}
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to={`/events/${event.id}/scan`}
            className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Escanear QR
          </Link>
          {event.plan === 'premium' && (
            <Link
              to={`/events/${event.id}/reports`}
              className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Reportes
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-6">
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconUsers className="w-5 h-5 mb-1 mx-auto text-gray-400" />
          <p className="text-2xl font-semibold text-gray-900">{event.guestCount}</p>
          <p className="text-xs text-gray-500">Invitados ({totalPeople} personas)</p>
        </div>
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconCheckCircle className="w-5 h-5 mb-1 mx-auto text-green-600" />
          <p className="text-2xl font-semibold text-green-600">{event.checkedInCount}</p>
          <p className="text-xs text-gray-500">Confirmados</p>
        </div>
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconClock className="w-5 h-5 mb-1 mx-auto text-gray-400" />
          <p className="text-2xl font-semibold text-gray-400">{event.guestCount - event.checkedInCount}</p>
          <p className="text-xs text-gray-500">Pendientes</p>
        </div>
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconHome className="w-5 h-5 mb-1 mx-auto text-primary" />
          <p className="text-2xl font-semibold text-primary">{peopleInside}</p>
          <p className="text-xs text-gray-500">Personas dentro ahora</p>
        </div>
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconThumbsUp className="w-5 h-5 mb-1 mx-auto text-gray-400" />
          <p className="text-2xl font-semibold text-gray-900">{rsvpYes}</p>
          <p className="text-xs text-gray-500">RSVP: asistirán</p>
        </div>
        <div className="card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
          <IconThumbsDown className="w-5 h-5 mb-1 mx-auto text-gray-400" />
          <p className="text-2xl font-semibold text-gray-400">{rsvpNo}</p>
          <p className="text-xs text-gray-500">RSVP: no asistirán</p>
        </div>
      </div>

      <div className="mb-4">
        <GuestAddForm eventId={event.id} />
      </div>

      {event.plan === 'premium' && (
        <>
          <WelcomeMessageEditor eventId={event.id} welcomeMessage={event.welcomeMessage || ''} />
          <BrandingEditor eventId={event.id} accentColor={event.accentColor || ''} logoUrl={event.logoUrl || ''} />
        </>
      )}

      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h2 className="font-medium text-gray-900">Invitados</h2>
          <button
            onClick={handleExport}
            disabled={exporting || guests.length === 0}
            className="text-sm text-primary font-medium disabled:opacity-50"
          >
            {exporting ? 'Generando PDF...' : 'Exportar pases a PDF'}
          </button>
        </div>
        {guests.length > 0 && (
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        )}
        <GuestList eventId={event.id} guests={filteredGuests} />
      </div>

      <div className="border border-gray-200 rounded-lg bg-white p-4">
        <h2 className="font-medium text-gray-900 mb-2">Estado del evento</h2>
        <p className="text-sm text-gray-500 mb-3">
          Estado actual: <span className="font-medium">{statusLabel(event.status)}</span>
        </p>
        <div className="flex gap-2 flex-wrap">
          {event.status === 'active' && (
            <button
              onClick={() => handleStatusChange('cancelled')}
              disabled={updatingStatus}
              className="text-sm border border-red-300 text-red-600 rounded-md px-3 py-1.5 font-medium hover:bg-red-50 disabled:opacity-50"
            >
              Cancelar evento
            </button>
          )}
          {event.status === 'active' && (
            <button
              onClick={() => handleStatusChange('archived')}
              disabled={updatingStatus}
              className="text-sm border border-gray-300 text-gray-600 rounded-md px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Archivar evento
            </button>
          )}
          {event.status !== 'active' && (
            <button
              onClick={() => handleStatusChange('active')}
              disabled={updatingStatus}
              className="text-sm border border-gray-300 text-gray-600 rounded-md px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Reactivar evento
            </button>
          )}
          <Link
            to="/events/new"
            className="text-sm border border-gray-300 text-gray-600 rounded-md px-3 py-1.5 font-medium hover:bg-gray-50"
          >
            Crear nuevo evento
          </Link>
        </div>
      </div>

      <div className="border border-red-200 rounded-lg bg-white p-4 mt-4">
        <h2 className="font-medium text-red-700 mb-1">Eliminar evento</h2>
        <p className="text-sm text-gray-500 mb-3">
          Borra el evento, sus invitados y el historial de check-ins de forma permanente. No se puede deshacer.
        </p>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-sm border border-red-300 text-red-600 rounded-md px-3 py-1.5 font-medium hover:bg-red-50 disabled:opacity-50"
        >
          {deleting ? 'Eliminando...' : 'Eliminar evento definitivamente'}
        </button>
      </div>
    </div>
  )
}

function statusLabel(status: string) {
  if (status === 'active') return 'Activo'
  if (status === 'cancelled') return 'Cancelado'
  return 'Archivado'
}
