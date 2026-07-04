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
import { optimizedImageUrl } from '../utils/cloudinary'
import { PlanBadge } from '../components/PlanBadge'
import { GuestAddForm } from '../components/GuestAddForm'
import { GuestList } from '../components/GuestList'
import { EditEventForm } from '../components/EditEventForm'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { SkeletonBlock } from '../components/Skeleton'
import { EventAnalytics } from '../components/EventAnalytics'
import { ReminderSection } from '../components/ReminderSection'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { EventCountdown } from '../components/EventCountdown'
import { formatDate, formatTime12h } from '../utils/time'
import {
  IconArrowLeft,
  IconCalendar,
  IconCheckCircle,
  IconEdit,
  IconListOrdered,
  IconMapPin,
  IconUserPlus,
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
  // lleve directo a una sección con #hash.
  useEffect(() => {
    if (!event || !location.hash) return
    const id = location.hash.slice(1)
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [event, location.hash])

  // Memoizado para que GuestList (React.memo) reciba la misma referencia entre
  // renders en los que guests/search/statusFilter/sortBy no cambiaron.
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
      return b.createdAt - a.createdAt
    })
  }, [guests, search, statusFilter, sortBy])

  const { totalPeople, totalCollected, rsvpYes, rsvpNo } = useGuestStats(guests, event?.ticketPrice ?? 0)

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <SkeletonBlock className="w-full h-40 rounded-xl mb-4" />
        <SkeletonBlock className="h-6 w-1/2 mb-2" />
        <SkeletonBlock className="h-4 w-1/3 mb-6" />
        <div className="grid grid-cols-3 gap-3">
          <SkeletonBlock className="h-16 rounded-lg" />
          <SkeletonBlock className="h-16 rounded-lg" />
          <SkeletonBlock className="h-16 rounded-lg" />
        </div>
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-red-500">{error}</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
          ← Volver al Dashboard
        </Link>
      </div>
    )
  }
  if (!event) {
    return (
      <div className="text-center mt-16 px-4">
        <p className="text-gray-500">Evento no encontrado.</p>
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
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
        <Link to="/dashboard" className="inline-block mt-4 bg-primary text-white rounded-xl px-4 py-2 text-sm font-medium hover:bg-primary-dark transition-colors">
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
      {/* Toasts flotantes */}
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

      {/* Navegación */}
      <Link to="/dashboard" className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1.5 mb-5">
        <IconArrowLeft className="w-4 h-4" /> Mis eventos
      </Link>

      {/* ── HERO DEL EVENTO ── */}
      <div className="rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-5">
        {event.coverImage && (
          <div className="h-44 sm:h-56 overflow-hidden">
            <img
              src={optimizedImageUrl(event.coverImage, 800)}
              alt="Portada del evento"
              loading="lazy"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5">
          {/* Estado + plan */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusPill status={event.status} />
            <PlanBadge plan={event.plan} />
          </div>

          {/* Nombre + botón editar */}
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight break-words min-w-0">
              {event.name}
            </h1>
            {isOwner && (
              <button
                onClick={() => setEditingEvent((v) => !v)}
                aria-label="Editar evento"
                className={`shrink-0 p-2 rounded-lg transition-colors ${
                  editingEvent
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <IconEdit className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Fecha, hora y lugar */}
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <IconCalendar className="w-4 h-4 shrink-0" />
              <span>
                {formatDate(event.date)}
                {event.startTime && (
                  <> · {formatTime12h(event.startTime)}{event.endTime && ` – ${formatTime12h(event.endTime)}`}</>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <IconMapPin className="w-4 h-4 shrink-0" />
              <span>{event.location}</span>
            </div>
          </div>

          <EventCountdown
            date={event.date}
            startTime={event.startTime}
            endTime={event.endTime}
            className="mt-3"
          />
        </div>
      </div>

      {/* Formulario de edición (inline, visible al hacer clic en el lápiz) */}
      {isOwner && editingEvent && (
        <div className="mb-5">
          <EditEventForm event={event} onDone={() => setEditingEvent(false)} />
        </div>
      )}

      {/* ── ACCIONES PRIMARIAS ── */}
      <div className="flex gap-2.5 mb-5">
        <Link
          to={`/events/${event.id}/scan`}
          className="flex-1 flex items-center justify-center bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary-dark transition-colors"
        >
          Escanear pases
        </Link>
        <Link
          to={`/events/${event.id}/wall`}
          className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center whitespace-nowrap"
        >
          Muro
        </Link>
        {event.plan === 'premium' && (
          <Link
            to={`/events/${event.id}/reports`}
            className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center whitespace-nowrap"
          >
            Reportes
          </Link>
        )}
      </div>

      {/* ── ESTADÍSTICAS PRINCIPALES ── */}
      <div className="grid grid-cols-2 gap-3 mb-3">
        <MetricCard
          label="Invitados"
          value={event.guestCount}
          sub={`${totalPeople} personas en total`}
        />
        <MetricCard
          label="Escaneados"
          value={event.checkedInCount}
          sub={event.guestCount > 0
            ? `${Math.round((event.checkedInCount / event.guestCount) * 100)}% del total`
            : undefined}
          valueClass="text-green-600 dark:text-green-400"
        />
        <MetricCard
          label="Dentro ahora"
          value={event.occupancyCount}
          valueClass="text-primary"
        />
        <MetricCard
          label="Pendientes"
          value={event.guestCount - event.checkedInCount}
        />
      </div>

      {/* Estadísticas secundarias + cupo (colapsable) */}
      <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 mb-5">
        <summary className="flex items-center justify-between px-4 py-3 cursor-pointer select-none list-none text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
          <span className="font-medium">Más estadísticas</span>
          <span className="text-xs opacity-60">
            <span className="group-open:hidden">▾ Ver</span>
            <span className="hidden group-open:inline">▴ Ocultar</span>
          </span>
        </summary>
        <div className="border-t border-gray-100 dark:border-gray-700 p-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCard label="Asistirán" value={rsvpYes} />
            <MetricCard label="No asistirán" value={rsvpNo} />
            {event.requiresPayment && (
              <MetricCard
                label={`Recaudado (${event.currency})`}
                value={totalCollected}
                valueClass="text-green-600 dark:text-green-400"
              />
            )}
          </div>
          {event.capacity > 0 && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span>Cupo del evento</span>
                <span className="font-semibold">{totalPeople} / {event.capacity}</span>
              </div>
              <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${Math.min(100, (totalPeople / event.capacity) * 100)}%` }}
                />
              </div>
              {totalPeople > event.capacity && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1.5">
                  Los acompañantes hacen que el total supere el cupo configurado.
                </p>
              )}
            </div>
          )}
        </div>
      </details>

      {/* ── LISTA DE ESPERA ── */}
      {waitlist.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-700/50 rounded-xl bg-white dark:bg-gray-800 overflow-hidden mb-5">
          <div className="flex items-center gap-2 px-5 pt-5 pb-3">
            <IconListOrdered className="w-4 h-4 text-amber-500" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Lista de espera</h2>
            {waitingEntries.length > 0 && (
              <span className="ml-auto text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 rounded-full px-2 py-0.5 font-medium">
                {waitingEntries.length} esperando
              </span>
            )}
          </div>
          <div className="px-5 pb-5 space-y-2">
            {waitlist.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.name} {entry.lastName}</p>
                  {entry.phone && <p className="text-xs text-gray-500 dark:text-gray-400">{entry.phone}</p>}
                </div>
                {entry.status === 'waiting' ? (
                  <button
                    onClick={() => handlePromote(entry)}
                    disabled={promotingId === entry.id}
                    className="text-xs shrink-0 bg-primary text-white rounded-lg px-3 py-1.5 font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                  >
                    {promotingId === entry.id ? 'Promoviendo…' : 'Promover'}
                  </button>
                ) : (
                  <span className="text-xs shrink-0 text-green-600 dark:text-green-400 font-medium">Promovido ✓</span>
                )}
              </div>
            ))}
            {promotedEntries.length > 0 && (
              <p className="text-xs text-gray-400 dark:text-gray-500 pt-1">
                Los promovidos ya tienen su pase. Al promover, se muestra el enlace para avisarles por WhatsApp.
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── GESTIÓN DE INVITADOS ── */}
      <div id="add-guests" className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden mb-5">
        {/* Formulario de agregar (solo propietario en modo lista o mixto) */}
        {isOwner && event.entryMode !== 'open' && (
          <div className="p-5 border-b border-gray-100 dark:border-gray-700">
            <GuestAddForm eventId={event.id} guests={guests} />
          </div>
        )}

        <div className="p-5">
          {/* Encabezado + exportar */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Invitados
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={handleExportCsv}
                disabled={guests.length === 0}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-40 transition-colors"
              >
                CSV
              </button>
              <span className="text-gray-200 dark:text-gray-600 select-none">|</span>
              {exporting ? (
                <button onClick={handleCancelExportPdf} className="text-xs text-red-500 font-medium hover:underline">
                  Cancelar {exportProgress ? `(${exportProgress.done}/${exportProgress.total})` : ''}
                </button>
              ) : (
                <button
                  onClick={handleExportPdf}
                  disabled={guests.length === 0}
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-40 transition-colors"
                >
                  PDF
                </button>
              )}
            </div>
          </div>

          {/* Barra de progreso de exportación PDF */}
          {exporting && exportProgress && exportProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
              />
            </div>
          )}
          {exportPdfError && <p className="text-xs text-red-500 mb-3">{exportPdfError}</p>}

          {/* Búsqueda y filtros */}
          {guests.length > 0 && (
            <>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o apellido…"
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm mb-3 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
              />
              <div className="flex gap-2 mb-4">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">Todos</option>
                  <option value="confirmed">Confirmados</option>
                  <option value="scanned">Ya escaneados</option>
                  <option value="declined">No asistirán</option>
                  <option value="pending">Pendientes</option>
                </select>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="newest">Más nuevos</option>
                  <option value="oldest">Más antiguos</option>
                  <option value="az">A–Z</option>
                  <option value="za">Z–A</option>
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
      </div>

      {/* ── RECORDATORIOS ── */}
      {guests.length > 0 && (
        <ReminderSection event={event} guests={guests} />
      )}

      {/* ── INGRESO LIBRE / MIXTO ── */}
      {event.entryMode !== 'list' && (
        <details
          id="open-entry-links"
          className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 mb-5"
          open
        >
          <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                {event.entryMode === 'hybrid' ? 'Ingreso mixto' : 'Ingreso libre'}
              </h2>
              {event.entryMode === 'hybrid' && (
                <span className="text-xs bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">Mixto</span>
              )}
            </div>
            <span className="text-xs text-gray-400">
              <span className="group-open:hidden">▾</span>
              <span className="hidden group-open:inline">▴</span>
            </span>
          </summary>
          <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-3">
            <PublicLink
              label="Auto-registro"
              desc="Los asistentes se registran y obtienen su QR propio"
              path={`/events/${event.id}/join`}
            />
            <PublicLink
              label="Ingreso directo"
              desc="Solo confirman llegada — sin QR individual"
              path={`/events/${event.id}/arrive`}
            />
          </div>
        </details>
      )}

      {/* ── ANALÍTICA (premium, colapsable) ── */}
      {event.plan === 'premium' && (
        <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 mb-5">
          <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Analítica
            </span>
            <span className="text-xs text-gray-400">
              <span className="group-open:hidden">▾ Ver</span>
              <span className="hidden group-open:inline">▴ Ocultar</span>
            </span>
          </summary>
          <div className="border-t border-gray-100 dark:border-gray-700 p-5">
            <EventAnalytics guests={guests} loading={guestsLoading} />
          </div>
        </details>
      )}

      {/* ── RESUMEN DE CHECK-INS ── */}
      {isOwner && organizerNotifyEnabled && checkinsThisSession.length > 0 && (
        <div className="border border-primary/20 bg-primary/5 dark:bg-primary/10 rounded-xl p-5 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <IconCheckCircle className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Resumen de check-ins</h2>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {checkinsThisSession.length} check-in{checkinsThisSession.length !== 1 ? 's' : ''} desde que abriste esta página.
          </p>
          <button
            onClick={handleSendCheckinSummary}
            disabled={summarySending}
            className="text-sm bg-primary text-white rounded-xl px-4 py-2.5 font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {summarySending ? 'Enviando…' : 'Enviar resumen por email'}
          </button>
        </div>
      )}

      {/* ── GESTIÓN DEL EVENTO (solo propietario, colapsable) ── */}
      {isOwner && (
        <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-5">
          <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
            <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
              Gestión del evento
            </span>
            <span className="text-xs text-gray-400">
              <span className="group-open:hidden">▾</span>
              <span className="hidden group-open:inline">▴</span>
            </span>
          </summary>

          <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">

            {/* Co-organizadores */}
            <div className="p-5">
              <div className="flex items-center gap-2 mb-1">
                <IconUserPlus className="w-4 h-4 text-gray-400" />
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Co-organizadores</h3>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Permite a otras personas escanear pases y ver el evento.
              </p>
              {Object.entries(coOrgsMap).length > 0 && (
                <div className="space-y-2 mb-3">
                  {Object.entries(coOrgsMap).map(([uid, email]) => (
                    <div key={uid} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/40 rounded-lg px-3 py-2">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{email}</span>
                      <button
                        onClick={() => setRemovingCoOrg({ uid, email })}
                        aria-label={`Quitar a ${email} como co-organizador`}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
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
                  className="flex-1 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
                />
                <button
                  type="submit"
                  disabled={coOrgLoading || !coOrgEmail.trim()}
                  className="bg-primary text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {coOrgLoading ? '…' : 'Agregar'}
                </button>
              </form>
              {coOrgError && <p className="text-xs text-red-500 mt-1.5">{coOrgError}</p>}
            </div>

            {/* Estado del evento */}
            <div className="p-5">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Estado del evento</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Estado actual: <span className="font-semibold">{statusLabel(event.status)}</span>
              </p>
              <div className="flex gap-2 flex-wrap">
                {event.status === 'active' ? (
                  <button
                    onClick={() => handleStatusChange('cancelled')}
                    disabled={updatingStatus}
                    className="text-sm border border-red-200 text-red-600 dark:border-red-700/60 dark:text-red-400 rounded-lg px-4 py-2 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                  >
                    Cancelar evento
                  </button>
                ) : (
                  <button
                    onClick={() => handleStatusChange('active')}
                    disabled={updatingStatus}
                    className="text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                  >
                    Reactivar evento
                  </button>
                )}
                <Link
                  to="/events/new"
                  className="text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Crear nuevo evento
                </Link>
              </div>
            </div>

            {/* Zona peligrosa */}
            <div className="p-5 bg-red-50/40 dark:bg-red-900/10">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Zona peligrosa</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                Borra el evento, sus invitados y el historial de check-ins de forma permanente. No se puede deshacer.
              </p>
              {actionError && (
                <p className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-3">
                  {actionError}
                </p>
              )}
              <button
                onClick={() => setConfirmDelete(true)}
                disabled={deleting}
                className="text-sm border border-red-300 dark:border-red-700/60 text-red-600 dark:text-red-400 rounded-lg px-4 py-2 font-medium hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Eliminando…' : 'Eliminar evento definitivamente'}
              </button>
            </div>
          </div>
        </details>
      )}

      {/* Diálogos de confirmación */}
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

      {/* Diálogo de promover desde lista de espera — tiene dos acciones
          (WhatsApp + copiar enlace) que no encajan en ConfirmDialog. */}
      {promoteResult && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-black/50 backdrop-blur-sm"
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
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Este invitado no tiene teléfono registrado — solo podés copiar el enlace.
                </p>
              )}
              <button
                onClick={handleCopyPromoteLink}
                className="border border-gray-300 dark:border-gray-600 rounded-xl py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {promoteLinkCopied ? 'Copiado ✓' : 'Copiar enlace'}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-3 break-all">{promoteResult.passUrl}</p>
            <button
              onClick={() => setPromoteResult(null)}
              className="w-full text-sm text-gray-500 dark:text-gray-400 mt-4 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </>
  )

  // Vaquera y Graduación adoptan su propia identidad en el dashboard
  // del organizador — condicional explícito para que los otros temas
  // no cambien la animación de entrada.
  if (event.templateId === 'cowboy' || event.templateId === 'graduation') {
    return (
      <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="max-w-3xl mx-auto px-4 py-8">
        {content}
      </InvitationThemeRoot>
    )
  }

  return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
}

// Tarjeta de métrica: etiqueta arriba, número grande abajo.
function MetricCard({
  label,
  value,
  sub,
  valueClass = 'text-gray-900 dark:text-white',
}: {
  label: string
  value: number
  sub?: string
  valueClass?: string
}) {
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}

// Píldora de estado con punto de color.
function StatusPill({ status }: { status: string }) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
        Activo
      </span>
    )
  }
  if (status === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-full px-2.5 py-1">
        <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
        Cancelado
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 rounded-full px-2.5 py-1">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" />
      Archivado
    </span>
  )
}

function PublicLink({ label, desc, path }: { label: string; desc: string; path: string }) {
  const [copied, setCopied] = useState(false)
  const url = window.location.origin + path

  // En celular, `navigator.share` abre la hoja nativa (WhatsApp, mensajes,
  // etc.) — mismo patrón ya validado en GuestList.handleShare. Sin esa API
  // (desktop/navegadores viejos) cae al copiado al portapapeles de siempre.
  async function share() {
    if (navigator.share) {
      try {
        await navigator.share({ title: label, text: desc, url })
        return
      } catch {
        return
      }
    }
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="flex items-start justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
      </div>
      <button
        onClick={share}
        className="text-xs shrink-0 border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded-lg px-2.5 py-2.5 font-medium hover:bg-white dark:hover:bg-gray-600 transition-colors"
      >
        {copied ? 'Copiado ✓' : 'Compartir'}
      </button>
    </div>
  )
}

function statusLabel(status: string) {
  if (status === 'active') return 'Activo'
  if (status === 'cancelled') return 'Cancelado'
  return 'Archivado'
}
