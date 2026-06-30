import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import { useCheckinToast } from '../hooks/useCheckinToast'
import { useEventExport } from '../hooks/useEventExport'
import { useWaitlistPanel } from '../hooks/useWaitlistPanel'
import { useCoOrganizers } from '../hooks/useCoOrganizers'
import { useGuestStats } from '../hooks/useGuestStats'
import { useCheckinSessionAccumulator } from '../hooks/useCheckinSessionAccumulator'
import { useModalA11y } from '../hooks/useModalA11y'
import { deleteEvent, setEventStatus } from '../firebase/events'
import { PlanBadge } from '../components/PlanBadge'
import { GuestAddForm } from '../components/GuestAddForm'
import { GuestList } from '../components/GuestList'
import { EditEventForm } from '../components/EditEventForm'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { EventAnalytics } from '../components/EventAnalytics'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { EventCountdown } from '../components/EventCountdown'
import { formatDate, formatTime12h } from '../utils/time'
import {
  IconArrowLeft,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconHome,
  IconListOrdered,
  IconThumbsDown,
  IconThumbsUp,
  IconTicket,
  IconUserPlus,
  IconUsers,
  IconWhatsApp,
  IconX,
} from '../components/Icons'

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { event, guests, loading, guestsLoading, error } = useEvent(eventId)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'scanned' | 'declined' | 'pending'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest')
  const [editingEvent, setEditingEvent] = useState(false)
  const [removingCoOrg, setRemovingCoOrg] = useState<{ uid: string; email: string } | null>(null)
  const checkinToast = useCheckinToast(eventId)
  const { exporting, exportProgress, exportPdfError, handleExportPdf, handleCancelExportPdf, handleExportCsv } =
    useEventExport(event, guests)
  const {
    waitlist,
    waitingEntries,
    promotedEntries,
    promotingId,
    promoteResult,
    promoteLinkCopied,
    handlePromote,
    handleCopyPromoteLink,
    setPromoteResult,
  } = useWaitlistPanel(eventId)
  const promoteDialogRef = useModalA11y<HTMLDivElement>(!!promoteResult, () => setPromoteResult(null))
  const { coOrgEmail, setCoOrgEmail, coOrgLoading, coOrgError, setCoOrgError, handleAddCoOrg, handleRemoveCoOrg } =
    useCoOrganizers(eventId, event?.ownerId)

  const { checkinsThisSession, organizerNotifyEnabled, summarySending, summaryToast, handleSendCheckinSummary } =
    useCheckinSessionAccumulator(eventId, guests, user)

  // Permite que el CTA del modal de éxito de EventCreate (u otros enlaces)
  // lleve directo a una sección con #hash — React Router no hace scroll a
  // anclas por sí solo en una SPA, así que se resuelve a mano una vez que el
  // contenido del evento ya está en el DOM.
  useEffect(() => {
    if (!event || !location.hash) return
    const id = location.hash.slice(1)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [event, location.hash])

  // Memoizado para que GuestList (React.memo) reciba la misma referencia de
  // array entre renders en los que `guests`/`search`/`statusFilter`/`sortBy`
  // no cambiaron — si no, cualquier re-render de EventDetail por estado no
  // relacionado (toasts, exportPdf, etc.) invalidaría el memo de GuestList
  // sin motivo real.
  const filteredGuests = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = guests.filter((g) => {
      if (term && !g.name.toLowerCase().includes(term) && !(g.lastName || '').toLowerCase().includes(term)) {
        return false
      }
      if (statusFilter === 'confirmed') return g.rsvpStatus === 'yes'
      if (statusFilter === 'scanned') return g.status === 'checked_in'
      if (statusFilter === 'declined') return g.rsvpStatus === 'no'
      if (statusFilter === 'pending') return g.rsvpStatus === 'pending' && g.status !== 'checked_in'
      return true
    })
    return [...filtered].sort((a, b) => {
      if (sortBy === 'az') return `${a.name} ${a.lastName || ''}`.localeCompare(`${b.name} ${b.lastName || ''}`)
      if (sortBy === 'za') return `${b.name} ${b.lastName || ''}`.localeCompare(`${a.name} ${a.lastName || ''}`)
      if (sortBy === 'oldest') return a.createdAt - b.createdAt
      return b.createdAt - a.createdAt // newest
    })
  }, [guests, search, statusFilter, sortBy])

  const { totalPeople, totalCollected, peopleInside, rsvpYes, rsvpNo } = useGuestStats(guests, event?.ticketPrice ?? 0)

  if (loading) return <p className="text-center text-gray-500 mt-16">Cargando…</p>
  if (error) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-red-500">{error}</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }
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

  const coOrgsMap = event.coOrganizersMap || {}
  const isOwner = user?.uid === event.ownerId
  const isCoOrg = !!user && user.uid in coOrgsMap
  const hasAccess = isOwner || isCoOrg

  if (user && !hasAccess) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">No tienes acceso a este evento.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-md px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
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

  const content = (
    <>
      {checkinToast && (
        <div className="fixed top-16 right-4 z-50 bg-primary text-white text-sm rounded-lg shadow-lg px-4 py-2.5 animate-pulse flex items-center gap-2">
          <IconCheckCircle className="w-4 h-4" /> {checkinToast}
        </div>
      )}
      {summaryToast && (
        <div className="fixed top-28 right-4 z-50 bg-primary text-white text-sm rounded-lg shadow-lg px-4 py-2.5 animate-pulse flex items-center gap-2">
          <IconCheckCircle className="w-4 h-4" /> {summaryToast}
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
              <button onClick={() => setEditingEvent((v) => !v)} className="shrink-0 text-gray-400 hover:text-primary transition-colors" title="Editar evento" aria-label="Editar evento">
                <IconEdit className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {formatDate(event.date)} · {event.location}
          </p>
          {event.startTime && (
            <p className="text-lg font-bold mt-0.5 text-primary">
              {formatTime12h(event.startTime)}{event.endTime && ` – ${formatTime12h(event.endTime)}`}
            </p>
          )}
          <EventCountdown
            date={event.date}
            startTime={event.startTime}
            endTime={event.endTime}
            className="text-sm font-medium mt-0.5 text-gray-500"
          />
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
        <StatCard icon={<IconCheckCircle className="w-5 h-5 mb-1 mx-auto text-green-600" />} value={event.checkedInCount} label="Asistentes escaneados" valueClass="text-green-600" />
        <StatCard icon={<IconClock className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={event.guestCount - event.checkedInCount} label="Pendientes" />
        <StatCard icon={<IconHome className="w-5 h-5 mb-1 mx-auto text-primary" />} value={peopleInside} label="Personas dentro ahora" valueClass="text-primary" />
        <StatCard icon={<IconThumbsUp className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={rsvpYes} label="Asistirán" />
        <StatCard icon={<IconThumbsDown className="w-5 h-5 mb-1 mx-auto text-gray-400" />} value={rsvpNo} label="No asistirán" />
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
        <EventAnalytics guests={guests} loading={guestsLoading} />
      )}

      {/* Límite de invitados: visible para todos los modos de ingreso. addGuest()
          bloquea por cantidad de invitados (sin contar acompañantes) — por eso
          el total de personas (sí los cuenta) puede superar el cupo igual. */}
      {event.capacity > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 mb-1">
            <span>Límite de invitados</span>
            <span className="font-medium">{totalPeople} / {event.capacity}</span>
          </div>
          <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, (totalPeople / event.capacity) * 100)}%` }} />
          </div>
          {totalPeople > event.capacity && (
            <p className="text-xs text-amber-600 mt-1.5">Los acompañantes hacen que el total de personas supere el cupo configurado.</p>
          )}
        </div>
      )}

      {/* Open/hybrid entry links */}
      {event.entryMode !== 'list' && (
        <div id="open-entry-links" className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium text-gray-900 dark:text-white">Ingreso libre</h2>
            {event.entryMode === 'hybrid' && (
              <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">Mixto</span>
            )}
          </div>
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
                    {promotingId === entry.id ? 'Promoviendo…' : 'Promover'}
                  </button>
                ) : (
                  <span className="text-xs shrink-0 text-green-600 font-medium">Promovido ✓</span>
                )}
              </div>
            ))}
          </div>
          {promotedEntries.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">Los promovidos ya tienen su pase generado. Al promover, se muestra el enlace para avisarles por WhatsApp.</p>
          )}
        </div>
      )}

      {isOwner && event.entryMode !== 'open' && (
        <div id="add-guests" className="mb-4">
          <GuestAddForm eventId={event.id} guests={guests} />
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
          <>
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o apellido…"
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary" />
            <div className="flex gap-2 mb-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="all">Todos</option>
                <option value="confirmed">Confirmados (asistirán)</option>
                <option value="scanned">Ya escaneados</option>
                <option value="declined">No asistirán</option>
                <option value="pending">Pendientes</option>
              </select>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
              >
                <option value="newest">Más nuevos primero</option>
                <option value="oldest">Más antiguos primero</option>
                <option value="az">Nombre A-Z</option>
                <option value="za">Nombre Z-A</option>
              </select>
            </div>
          </>
        )}
        <GuestList
          eventId={event.id}
          guests={filteredGuests}
          requiresPayment={event.requiresPayment}
          ticketPrice={event.ticketPrice}
          currency={event.currency}
        />
      </div>

      {/* Resumen de check-ins (Prioridad 1 — "Email por check-in" reparado).
          Solo visible si el organizador activó el toggle en /profile Y hay
          al menos un check-in acumulado desde que se abrió esta página. */}
      {isOwner && organizerNotifyEnabled && checkinsThisSession.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
          <div className="flex items-center gap-2 mb-2">
            <IconCheckCircle className="w-4 h-4 text-primary" />
            <h2 className="font-medium text-gray-900 dark:text-white">Resumen de check-ins</h2>
          </div>
          <p className="text-sm text-gray-500 mb-3">
            {checkinsThisSession.length} check-in{checkinsThisSession.length !== 1 ? 's' : ''} desde que abriste esta página.
          </p>
          <button onClick={handleSendCheckinSummary} disabled={summarySending}
            className="text-sm bg-primary text-white rounded-md px-4 py-2 font-medium hover:opacity-90 transition-opacity disabled:opacity-50">
            {summarySending ? 'Enviando…' : 'Enviar resumen de check-ins'}
          </button>
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
                  <button onClick={() => setRemovingCoOrg({ uid, email })} aria-label={`Quitar a ${email} como co-organizador`} className="text-gray-400 hover:text-red-500 transition-colors">
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
              {coOrgLoading ? '…' : 'Agregar'}
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
              {deleting ? 'Eliminando…' : 'Eliminar evento definitivamente'}
            </button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Eliminar "${event.name}"`}
        message="Se borrarán todos los invitados y el historial de check-ins. Esta acción no se puede deshacer."
        confirmLabel={deleting ? 'Eliminando…' : 'Sí, eliminar'}
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />

      <ConfirmDialog
        open={!!removingCoOrg}
        title="Quitar co-organizador"
        message={`¿Quitar a ${removingCoOrg?.email} como co-organizador? Ya no podrá escanear pases ni ver este evento.`}
        confirmLabel="Quitar"
        danger
        onConfirm={() => { if (removingCoOrg) handleRemoveCoOrg(removingCoOrg.uid); setRemovingCoOrg(null) }}
        onCancel={() => setRemovingCoOrg(null)}
      />

      {/* Promover de lista de espera (Prioridad 2): mismo overlay/card/
          animate-bounce-in que ConfirmDialog, inline porque acá hace falta
          dos acciones (WhatsApp + copiar) en vez de un solo confirmar/
          cancelar — ConfirmDialog no soporta eso sin cambiar su contrato. */}
      {promoteResult && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPromoteResult(null) }}
        >
          <div
            ref={promoteDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label="Invitado promovido"
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm animate-bounce-in p-6"
          >
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">Invitado promovido</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
              {promoteResult.name} ya tiene su pase. Avisale por WhatsApp o copiá el enlace.
            </p>
            <div className="flex flex-col gap-2">
              {promoteResult.phone.replace(/\D/g, '') ? (
                <a
                  href={`https://wa.me/${promoteResult.phone.replace(/\D/g, '')}?text=${encodeURIComponent(
                    `¡Felicidades! Te hemos promovido a invitado de ${event.name}. Toca aquí: ${promoteResult.passUrl}`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 bg-[#25D366] text-white rounded-xl py-2.5 text-sm font-medium hover:opacity-90 transition-opacity"
                >
                  <IconWhatsApp className="w-4 h-4" /> Abrir WhatsApp
                </a>
              ) : (
                <p className="text-xs text-amber-600">Este invitado no tiene teléfono registrado — solo podés copiar el enlace.</p>
              )}
              <button
                onClick={handleCopyPromoteLink}
                className="border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {promoteLinkCopied ? 'Copiado ✓' : 'Copiar enlace'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3 break-all">{promoteResult.passUrl}</p>
            <button onClick={() => setPromoteResult(null)} className="w-full text-sm text-gray-500 mt-4 hover:text-gray-700">
              Cerrar
            </button>
          </div>
        </div>
      )}
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
