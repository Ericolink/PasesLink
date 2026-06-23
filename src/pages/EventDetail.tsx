import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import { useCheckinToast } from '../hooks/useCheckinToast'
import { deleteEvent, setEventStatus, addCoOrganizer, removeCoOrganizer } from '../firebase/events'
import { getUserByEmail } from '../firebase/userProfile'
import { subscribeToWaitlist, promoteFromWaitlist } from '../firebase/waitlist'
import { sendReminderEmail } from '../utils/emailjs'
import { PlanBadge } from '../components/PlanBadge'
import { GuestAddForm } from '../components/GuestAddForm'
import { GuestList } from '../components/GuestList'
import { EditEventForm } from '../components/EditEventForm'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EventAnalytics } from '../components/EventAnalytics'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import {
  IconArrowLeft,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconHome,
  IconListOrdered,
  IconMail,
  IconThumbsDown,
  IconThumbsUp,
  IconTicket,
  IconUserPlus,
  IconUsers,
  IconX,
} from '../components/Icons'
import type { WaitlistEntry } from '../types'

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const { event, guests, loading, error } = useEvent(eventId)
  const [exporting, setExporting] = useState(false)
  const [exportProgress, setExportProgress] = useState<{ done: number; total: number } | null>(null)
  const [exportPdfError, setExportPdfError] = useState('')
  const exportCancelledRef = useRef(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const [editingEvent, setEditingEvent] = useState(false)
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([])
  const [promotingId, setPromotingId] = useState<string | null>(null)
  const [coOrgEmail, setCoOrgEmail] = useState('')
  const [coOrgLoading, setCoOrgLoading] = useState(false)
  const [coOrgError, setCoOrgError] = useState('')
  const [reminderSending, setReminderSending] = useState(false)
  const [reminderDone, setReminderDone] = useState(0)
  const checkinToast = useCheckinToast(eventId)

  useEffect(() => {
    if (!eventId) return
    return subscribeToWaitlist(eventId, setWaitlist)
  }, [eventId])

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando...</p>
  if (error) return <p className="text-center text-red-500 mt-16">{error}</p>
  if (!event) return <p className="text-center text-gray-500 mt-16">Evento no encontrado.</p>

  const coOrgsMap = event.coOrganizersMap || {}
  const isOwner = user?.uid === event.ownerId
  const isCoOrg = !!user && user.uid in coOrgsMap
  const hasAccess = isOwner || isCoOrg

  if (user && !hasAccess) {
    return <p className="text-center text-gray-500 mt-16">No tienes acceso a este evento.</p>
  }

  async function handleExportPdf() {
    setExporting(true)
    setExportPdfError('')
    setExportProgress({ done: 0, total: guests.length })
    exportCancelledRef.current = false
    try {
      const { exportGuestPassesPdf } = await import('../utils/exportPdf')
      const result = await exportGuestPassesPdf(event!, guests, {
        onProgress: (done, total) => setExportProgress({ done, total }),
        isCancelled: () => exportCancelledRef.current,
      })
      if (result === 'cancelled') {
        setExportPdfError('Exportación cancelada.')
      }
    } catch (err) {
      console.error('Error exporting guest passes PDF:', err)
      setExportPdfError('No se pudo generar el PDF. Intenta de nuevo.')
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  function handleCancelExportPdf() {
    exportCancelledRef.current = true
  }

  function handleExportCsv() {
    const rows = [
      [
        'Nombre', 'Email', 'Teléfono', 'Estado', 'RSVP', 'Check-in',
        ...(event!.requiresPayment ? ['Pago'] : []),
      ],
      ...guests.map((g) => [
        g.name,
        g.email || '',
        g.phone || '',
        g.status === 'checked_in' ? 'Asistió' : 'Invitado',
        g.rsvpStatus === 'yes' ? 'Sí' : g.rsvpStatus === 'no' ? 'No' : 'Pendiente',
        g.checkedInAt ? new Date(g.checkedInAt).toLocaleString('es') : '',
        ...(event!.requiresPayment ? [g.paymentStatus === 'paid' ? 'Pagó' : 'Pendiente'] : []),
      ]),
    ]
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invitados-${event!.name.replace(/\s+/g, '_')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleStatusChange(status: 'cancelled' | 'archived' | 'active') {
    if (!eventId) return
    setUpdatingStatus(true)
    setActionError('')
    try {
      await setEventStatus(eventId, status)
    } catch {
      setActionError('No se pudo actualizar el estado del evento. Intenta de nuevo.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  async function handleDelete() {
    if (!eventId) return
    setDeleting(true)
    setActionError('')
    try {
      await deleteEvent(eventId)
      navigate('/dashboard')
    } catch {
      setConfirmDelete(false)
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setDeleting(false)
    }
  }

  async function handlePromote(entry: WaitlistEntry) {
    if (!eventId) return
    setPromotingId(entry.id)
    try {
      const qrToken = await promoteFromWaitlist(eventId, entry.id, entry.name, entry.lastName, entry.phone)
      if (qrToken) {
        const passUrl = `${window.location.origin}/pass/${eventId}/${qrToken}`
        await navigator.clipboard.writeText(passUrl).catch(() => {})
        alert(`Invitado promovido. Link copiado:\n${passUrl}`)
      }
    } finally {
      setPromotingId(null)
    }
  }

  async function handleAddCoOrg(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || !coOrgEmail.trim()) return
    setCoOrgLoading(true)
    setCoOrgError('')
    try {
      const found = await getUserByEmail(coOrgEmail)
      if (!found) {
        setCoOrgError('Usuario no encontrado. Debe estar registrado en la app.')
        return
      }
      if (found.uid === event?.ownerId) {
        setCoOrgError('Ese usuario ya es el organizador principal.')
        return
      }
      await addCoOrganizer(eventId, found.uid, found.email)
      setCoOrgEmail('')
    } catch {
      setCoOrgError('Error al agregar co-organizador.')
    } finally {
      setCoOrgLoading(false)
    }
  }

  async function handleRemoveCoOrg(uid: string) {
    if (!eventId) return
    await removeCoOrganizer(eventId, uid)
  }

  async function handleSendReminders() {
    if (!eventId || !event) return
    const ev = event
    const withEmail = guests.filter((g) => g.email && g.status !== 'checked_in')
    if (withEmail.length === 0) return
    setReminderSending(true)
    setReminderDone(0)
    for (const g of withEmail) {
      const passUrl = `${window.location.origin}/pass/${eventId}/${g.qrToken}`
      await sendReminderEmail(g.email!, g.name, ev.name, ev.date, ev.location, passUrl)
      setReminderDone((n) => n + 1)
      await new Promise((r) => setTimeout(r, 300))
    }
    setReminderSending(false)
  }

  const totalPeople = guests.reduce((sum, g) => sum + 1 + g.companions, 0)
  const totalCollected = guests
    .filter((g) => g.paymentStatus === 'paid')
    .reduce((sum, g) => sum + event.ticketPrice * (1 + g.companions), 0)
  const insideGuests = guests.filter((g) => g.status === 'checked_in' && !g.checkedOutAt)
  const peopleInside = insideGuests.reduce((sum, g) => sum + 1 + g.companions, 0)
  const rsvpYes = guests.filter((g) => g.rsvpStatus === 'yes').length
  const rsvpNo = guests.filter((g) => g.rsvpStatus === 'no').length
  const guestsWithEmail = guests.filter((g) => g.email && g.status !== 'checked_in').length
  const waitingEntries = waitlist.filter((e) => e.status === 'waiting')
  const promotedEntries = waitlist.filter((e) => e.status === 'promoted')

  const filteredGuests = guests.filter((g) => {
    const term = search.trim().toLowerCase()
    if (!term) return true
    return g.name.toLowerCase().includes(term) || (g.email || '').toLowerCase().includes(term)
  })

  const content = (
    <>
      {checkinToast && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-white text-sm rounded-lg shadow-lg px-4 py-2.5 animate-pulse flex items-center gap-2">
          <IconCheckCircle className="w-4 h-4" /> {checkinToast}
        </div>
      )}
      <Link to="/dashboard" className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1 mb-3">
        <IconArrowLeft className="w-4 h-4" /> Mis eventos
      </Link>
      <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
        <div>
          {/* flex-wrap a propósito: con un nombre de evento muy largo (más
              notorio con el marco/listón de vaquera), el título pasa a una
              segunda línea entero en vez de forzar scroll horizontal o
              aplastar el badge/ícono de edición, que mantienen su tamaño
              (shrink-0) y siempre quedan junto al final del texto. */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h1 className="text-2xl font-semibold text-gray-900 break-words min-w-0">{event.name}</h1>
            <span className="shrink-0"><PlanBadge plan={event.plan} /></span>
            {isOwner && (
              <button onClick={() => setEditingEvent((v) => !v)} className="shrink-0 text-gray-400 hover:text-primary transition-colors" title="Editar evento">
                <IconEdit className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">{event.date} · {event.location}</p>
        </div>
        <div className="flex gap-2">
          <Link to={`/events/${event.id}/scan`} className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
            Escanear QR
          </Link>
          <Link to={`/events/${event.id}/wall`} className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
            Muro
          </Link>
          {event.plan === 'premium' && (
            <Link to={`/events/${event.id}/reports`} className="border border-gray-300 rounded-md px-4 py-2 text-sm font-medium hover:bg-gray-50 transition-colors">
              Reportes
            </Link>
          )}
        </div>
      </div>

      {isOwner && editingEvent && (
        <div className="mt-3">
          <EditEventForm event={event} onDone={() => setEditingEvent(false)} />
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 my-6">
        <StatCard icon={<IconUsers className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={event.guestCount} label={`Invitados (${totalPeople} personas)`} />
        <StatCard icon={<IconCheckCircle className="w-5 h-5 mb-1 mx-auto text-green-600" />} value={event.checkedInCount} label="Confirmados" valueClass="text-green-600" />
        <StatCard icon={<IconClock className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={event.guestCount - event.checkedInCount} label="Pendientes" />
        <StatCard icon={<IconHome className="w-5 h-5 mb-1 mx-auto text-primary" />} value={peopleInside} label="Personas dentro ahora" valueClass="text-primary" />
        <StatCard icon={<IconThumbsUp className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={rsvpYes} label="RSVP: asistirán" />
        <StatCard icon={<IconThumbsDown className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={rsvpNo} label="RSVP: no asistirán" />
        {event.requiresPayment && (
          <StatCard
            icon={<IconTicket className="w-5 h-5 mb-1 mx-auto text-green-600" />}
            value={totalCollected}
            label={`Recaudado (${event.currency})`}
            valueClass="text-green-600"
          />
        )}
      </div>

      {/* Analytics (premium) */}
      {event.plan === 'premium' && (
        <EventAnalytics guests={guests} />
      )}

      {/* Open/hybrid entry links */}
      {event.entryMode !== 'list' && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900 dark:text-white">Ingreso libre</h2>
            {event.entryMode === 'hybrid' && (
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">Mixto</span>
            )}
          </div>
          {event.capacity && (
            <div className="mb-4">
              <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
                <span>Cupo utilizado</span>
                <span className="font-medium">{event.checkedInCount} / {event.capacity}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (event.checkedInCount / event.capacity) * 100)}%` }} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <PublicLink label="Auto-registro" desc="Los asistentes se registran y obtienen su QR propio" path={`/events/${event.id}/join`} />
            <PublicLink label="Ingreso directo" desc="Solo confirman llegada — sin QR individual" path={`/events/${event.id}/arrive`} />
          </div>
        </div>
      )}

      {/* Waitlist */}
      {waitlist.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-700/50 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <IconListOrdered className="w-4 h-4 text-amber-500" />
            <h2 className="font-medium text-gray-900 dark:text-white">Lista de espera</h2>
            {waitingEntries.length > 0 && (
              <span className="text-xs bg-amber-100 text-amber-700 rounded-full px-2 py-0.5 font-medium">{waitingEntries.length} esperando</span>
            )}
          </div>
          <div className="space-y-2">
            {waitlist.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-2 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.name} {entry.lastName}</p>
                  {entry.phone && <p className="text-xs text-gray-500">{entry.phone}</p>}
                </div>
                {entry.status === 'waiting' ? (
                  <button
                    onClick={() => handlePromote(entry)}
                    disabled={promotingId === entry.id}
                    className="text-xs shrink-0 bg-primary text-white rounded-md px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    {promotingId === entry.id ? 'Promoviendo...' : 'Promover'}
                  </button>
                ) : (
                  <span className="text-xs shrink-0 text-green-600 font-medium">Promovido ✓</span>
                )}
              </div>
            ))}
          </div>
          {promotedEntries.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">Los promovidos ya tienen su pase generado. Al promover, el link se copia al portapapeles.</p>
          )}
        </div>
      )}

      {isOwner && event.entryMode !== 'open' && (
        <div className="mb-4">
          <GuestAddForm eventId={event.id} />
        </div>
      )}

      {/* Guest list */}
      <div className="border border-gray-200 rounded-lg bg-white p-4 mb-4">
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h2 className="font-medium text-gray-900">Invitados</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleExportCsv} disabled={guests.length === 0} className="text-sm text-primary font-medium disabled:opacity-40 hover:underline">
              CSV
            </button>
            <span className="text-gray-300">|</span>
            {exporting ? (
              <button onClick={handleCancelExportPdf} className="text-sm text-red-500 font-medium hover:underline">
                Cancelar {exportProgress ? `(${exportProgress.done}/${exportProgress.total})` : ''}
              </button>
            ) : (
              <button onClick={handleExportPdf} disabled={guests.length === 0} className="text-sm text-primary font-medium disabled:opacity-40">
                PDF
              </button>
            )}
          </div>
        </div>
        {exporting && exportProgress && exportProgress.total > 0 && (
          <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
            />
          </div>
        )}
        {exportPdfError && <p className="text-xs text-red-500 mb-2">{exportPdfError}</p>}
        {guests.length > 0 && (
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o email..."
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary" />
        )}
        <GuestList
          eventId={event.id}
          guests={filteredGuests}
          requiresPayment={event.requiresPayment}
          ticketPrice={event.ticketPrice}
          currency={event.currency}
        />
      </div>

      {/* Recordatorios */}
      {isOwner && guestsWithEmail > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <IconMail className="w-4 h-4 text-primary" />
            <h2 className="font-medium text-gray-900 dark:text-white">Recordatorios</h2>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            {guestsWithEmail} invitado{guestsWithEmail !== 1 ? 's' : ''} con email aún no confirmado{guestsWithEmail !== 1 ? 's' : ''}.
          </p>
          {reminderSending ? (
            <p className="text-sm text-primary font-medium">Enviando {reminderDone} / {guestsWithEmail}...</p>
          ) : reminderDone > 0 ? (
            <p className="text-sm text-green-600 font-medium">✓ {reminderDone} recordatorios enviados.</p>
          ) : (
            <button onClick={handleSendReminders}
              className="text-sm bg-primary text-white rounded-md px-4 py-2 font-medium hover:opacity-90 transition-opacity">
              Enviar recordatorio a todos
            </button>
          )}
        </div>
      )}

      {/* Co-organizadores */}
      {isOwner && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <IconUserPlus className="w-4 h-4 text-primary" />
            <h2 className="font-medium text-gray-900 dark:text-white">Co-organizadores</h2>
          </div>
          <p className="text-sm text-gray-500 mb-3">Permite a otras personas escanear pases y ver el evento.</p>

          {Object.entries(coOrgsMap).length > 0 && (
            <div className="space-y-2 mb-3">
              {Object.entries(coOrgsMap).map(([uid, email]) => (
                <div key={uid} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-700 dark:text-gray-300">{email}</span>
                  <button onClick={() => handleRemoveCoOrg(uid)} className="text-gray-400 hover:text-red-500 transition-colors">
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <form onSubmit={handleAddCoOrg} className="flex gap-2">
            <input
              type="email"
              value={coOrgEmail}
              onChange={(e) => { setCoOrgEmail(e.target.value); setCoOrgError('') }}
              placeholder="email@ejemplo.com"
              className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <button type="submit" disabled={coOrgLoading || !coOrgEmail.trim()}
              className="bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50">
              {coOrgLoading ? '...' : 'Agregar'}
            </button>
          </form>
          {coOrgError && <p className="text-xs text-red-500 mt-1">{coOrgError}</p>}
        </div>
      )}

      {isOwner && (
        <>
          {actionError && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2 mb-4">{actionError}</p>
          )}
          <div className="border border-gray-200 rounded-lg bg-white p-4">
            <h2 className="font-medium text-gray-900 mb-2">Estado del evento</h2>
            <p className="text-sm text-gray-500 mb-3">Estado actual: <span className="font-medium">{statusLabel(event.status)}</span></p>
            <div className="flex gap-2 flex-wrap">
              {event.status === 'active' && (
                <button onClick={() => handleStatusChange('cancelled')} disabled={updatingStatus}
                  className="text-sm border border-red-300 text-red-600 rounded-md px-3 py-1.5 font-medium hover:bg-red-50 disabled:opacity-50">
                  Cancelar evento
                </button>
              )}
              {event.status !== 'active' && (
                <button onClick={() => handleStatusChange('active')} disabled={updatingStatus}
                  className="text-sm border border-gray-300 text-gray-600 rounded-md px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-50">
                  Reactivar evento
                </button>
              )}
              <Link to="/events/new" className="text-sm border border-gray-300 text-gray-600 rounded-md px-3 py-1.5 font-medium hover:bg-gray-50">
                Crear nuevo evento
              </Link>
            </div>
          </div>

          <div className="border border-red-200 rounded-lg bg-white p-4 mt-4">
            <h2 className="font-medium text-red-700 mb-1">Eliminar evento</h2>
            <p className="text-sm text-gray-500 mb-3">
              Borra el evento, sus invitados y el historial de check-ins de forma permanente. No se puede deshacer.
            </p>
            <button onClick={() => setConfirmDelete(true)} disabled={deleting}
              className="text-sm border border-red-300 text-red-600 rounded-md px-3 py-1.5 font-medium hover:bg-red-50 disabled:opacity-50">
              {deleting ? 'Eliminando...' : 'Eliminar evento definitivamente'}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Eliminar "${event.name}"`}
        message="Se borrarán todos los invitados y el historial de check-ins. Esta acción no se puede deshacer."
        confirmLabel={deleting ? 'Eliminando...' : 'Sí, eliminar'}
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )

  // Vaquera y Graduación adoptan su propia identidad también en el
  // dashboard del organizador — condicional explícito (no envolvemos en
  // InvitationThemeRoot para cualquier templateId) para que los otros 8
  // temas no cambien ni la animación de entrada del dashboard, que hoy es
  // fija (animate-fade-in).
  if (event.templateId === 'cowboy' || event.templateId === 'graduation') {
    return (
      <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="max-w-3xl mx-auto px-4 py-8">
        {content}
      </InvitationThemeRoot>
    )
  }

  return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
}

function StatCard({ icon, value, label, valueClass = 'text-gray-900' }: { icon: React.ReactNode; value: number; label: string; valueClass?: string }) {
  return (
    <div className="invite-stat-card card-hover border border-gray-200 rounded-lg p-3 bg-white text-center">
      {icon}
      <p className={`text-2xl font-semibold ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  )
}

function PublicLink({ label, desc, path }: { label: string; desc: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin + path

  function copy() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 truncate">{desc}</p>
      </div>
      <button onClick={copy} className="text-xs shrink-0 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 font-medium hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors">
        {copied ? 'Copiado' : 'Copiar link'}
      </button>
    </div>
  )
}

function statusLabel(status: string) {
  if (status === 'active') return 'Activo'
  if (status === 'cancelled') return 'Cancelado'
  return 'Archivado'
}
