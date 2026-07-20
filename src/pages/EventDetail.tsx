import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useEvent } from '../hooks/useEvent'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useCheckinToast } from '../hooks/useCheckinToast'
import { Toast } from '../components/Toast'
import { useEventExport } from '../hooks/useEventExport'
import { useCoOrganizers } from '../hooks/useCoOrganizers'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useHasUnseenWallMessage } from '../hooks/useWallActivity'
import { useEventLifecycleActions } from '../hooks/useEventLifecycleActions'
import { resolveMaxCompanions } from '../firebase/guests'
import { optimizedImageUrl } from '../utils/cloudinary'
import { GuestAddForm } from '../components/GuestAddForm'
import { GuestList } from '../components/GuestList'
import { GuestSearchSheet } from '../components/GuestSearchSheet'
import { EditEventForm } from '../components/EditEventForm'
import { EventManagementPanel } from '../components/EventManagementPanel'
import { CoOrganizerPanel } from '../components/CoOrganizerPanel'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { SkeletonBlock } from '../components/Skeleton'
import { ReminderSection } from '../components/ReminderSection'
import { ThemeOrnament } from '../components/ThemeOrnament'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { EventCountdown } from '../components/EventCountdown'
import { AttendanceProgressBar } from '../components/AttendanceProgressBar'
import { ShareEventButton } from '../components/ShareCard/ShareEventButton'
import { ScreenHeader } from '../components/ScreenHeader'
import { formatDate, formatTime12h } from '../utils/time'
import {
  IconCalendar,
  IconCheck,
  IconCheckCircle,
  IconCopy,
  IconEdit,
  IconLink,
  IconLogOut,
  IconMapPin,
  IconSearch,
  IconShare,
  IconUserPlus,
} from '../components/Icons'

export function EventDetail() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const { event, guests, loading, error, guestsError, guestsTruncated, showAllGuests } = useEvent(eventId)
  useDocumentTitle(event?.name || 'Evento')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const eventActions = useEventLifecycleActions(eventId)
  const [actionError, setActionError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'confirmed' | 'scanned' | 'declined' | 'pending'>('all')
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'az' | 'za'>('newest')
  const [guestSearchSheetOpen, setGuestSearchSheetOpen] = useState(false)
  const [editingEvent, setEditingEvent] = useState(false)
  const [manageCoOrgOpen, setManageCoOrgOpen] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [checkinToast, dismissCheckinToast] = useCheckinToast(eventId)
  const hasUnseenWallMessage = useHasUnseenWallMessage(eventId)
  const {
    exporting,
    exportProgress,
    exportPdfError,
    exportExcelError,
    handleExportPdf,
    handleExportExcel,
    handleCancelExport,
  } = useEventExport(event, guests)
  const coOrg = useCoOrganizers(eventId, event?.ownerId, event?.coOrganizersMap)
  const { handleLeaveEvent } = coOrg
  const perms = useEventPermissions(event, user)

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

  // Cuenta solo estado/orden (no el texto de búsqueda, que ya se ve tal cual
  // en el propio botón disparador) para el badge de "Buscar y filtrar".
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0)

  // event.peopleCount (contador desnormalizado, mantenido con increment() en
  // cada alta/baja/edición de invitado) en vez de sumar partySize() sobre
  // `guests` — Fase 6: `guests` puede venir acotado (ver useEvent/
  // GUEST_WINDOW_DEFAULT), así que ya no es una fuente confiable para un
  // total que se muestra siempre. event.peopleCount es exacto sin importar
  // cuántos invitados estén cargados en pantalla.
  const totalPeople = event?.peopleCount ?? 0

  // Fase 6: exportar necesita el conjunto COMPLETO de invitados, no la
  // ventana acotada por default — si `guests` todavía está truncado al
  // pedir la exportación, primero se pide el resto (showAllGuests) y la
  // exportación real se dispara sola en cuanto termine de llegar (ver el
  // efecto más abajo), en vez de generar un PDF/Excel incompleto sin avisar.
  const [pendingExport, setPendingExport] = useState<'pdf' | 'excel' | null>(null)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!pendingExport || guestsTruncated) return
    if (pendingExport === 'pdf') handleExportPdf()
    else handleExportExcel()
    setPendingExport(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingExport, guestsTruncated])
  /* eslint-enable react-hooks/set-state-in-effect */

  function requestExportPdf() {
    if (guestsTruncated) { showAllGuests(); setPendingExport('pdf'); return }
    handleExportPdf()
  }

  function requestExportExcel() {
    if (guestsTruncated) { showAllGuests(); setPendingExport('excel'); return }
    handleExportExcel()
  }

  function handleSearchChange(value: string) {
    setSearch(value)
    // Búsqueda tiene que alcanzar a cualquier invitado, no solo a los que
    // ya están en la ventana acotada por default — mismo criterio que
    // exportar arriba.
    if (value.trim()) showAllGuests()
  }

  function handleStatusFilterChange(value: typeof statusFilter) {
    setStatusFilter(value)
    // Filtrar por estado (Confirmados/Escaneados/etc.) también tiene que
    // mirar a todos los invitados, no solo la ventana acotada — a
    // diferencia de ordenar (sortBy), que solo reacomoda lo ya cargado y no
    // esconde nada.
    if (value !== 'all') showAllGuests()
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-8">
        <SkeletonBlock className="w-full h-40 rounded-xl mb-4" />
        <SkeletonBlock className="h-6 w-1/2 mb-2" />
        <SkeletonBlock className="h-4 w-1/3 mb-6" />
        <SkeletonBlock className="h-20 rounded-xl mb-3" />
        <SkeletonBlock className="h-16 rounded-xl" />
      </div>
    )
  }
  if (error) {
    return <ErrorFallbackCTA message={error} tone="error" />
  }
  if (!event) {
    return <ErrorFallbackCTA message="Evento no encontrado." />
  }

  const coOrgsMap = event.coOrganizersMap || {}

  if (user && !perms.hasAccess) {
    return <ErrorFallbackCTA message="No tienes acceso a este evento." />
  }

  async function handleLeave() {
    if (!user) return
    setLeaving(true)
    setActionError('')
    try {
      await handleLeaveEvent(user.uid)
      navigate('/dashboard')
    } catch {
      setConfirmLeave(false)
      setActionError('No se pudo salir del evento. Intenta de nuevo.')
    } finally {
      setLeaving(false)
    }
  }

  const content = (
    <>
      {/* Toasts flotantes */}
      {checkinToast && (
        <Toast icon={<IconCheckCircle className="w-4 h-4 shrink-0" />} message={checkinToast} onDismiss={dismissCheckinToast} />
      )}

      {/* Navegación */}
      <ScreenHeader title={event.name} backTo="/dashboard" templateId={event.templateId} />

      {/* ── ACCIONES PRIMARIAS ── movidas antes del hero (que puede incluir
          una imagen de portada + countdown y ocupar fácilmente el primer
          viewport en mobile): Escanear/Muro/Reportes deben quedar visibles
          sin scroll apenas se entra al evento. */}
      <div className="flex gap-2.5 mb-5">
        <Link
          to={`/events/${event.id}/scan`}
          className="flex-1 flex items-center justify-center bg-primary text-white rounded-xl py-3.5 text-sm font-semibold hover:bg-primary-dark transition-colors"
        >
          Escanear pases
        </Link>
        <Link
          to={`/events/${event.id}/wall`}
          className="relative border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center whitespace-nowrap"
        >
          Muro
          {hasUnseenWallMessage && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </Link>
        <Link
          to={`/events/${event.id}/reports`}
          className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl px-4 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center whitespace-nowrap"
        >
          Reportes
        </Link>
      </div>

      {/* ── HERO DEL EVENTO ── */}
      <div className="invite-card-accent rounded-2xl overflow-hidden bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 mb-5">
        {event.coverImage && (
          <div className="h-44 sm:h-56 overflow-hidden">
            {/* Sin loading="lazy": es la imagen principal del primer
                viewport (candidata a LCP) — lazy-loading una imagen que ya
                está visible al cargar la página solo retrasa su propia
                descarga. */}
            <img
              src={optimizedImageUrl(event.coverImage, 800)}
              alt="Portada del evento"
              fetchPriority="high"
              crossOrigin="anonymous"
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="p-5">
          {/* Estado */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <StatusPill status={event.status} />
          </div>

          {/* Nombre + botón editar */}
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight break-words">
                {event.name}
              </h2>
              <ThemeOrnament templateId={event.templateId} className="w-10 h-4 mt-1 text-[var(--invite-accent)]" />
            </div>
            {(perms.editEvent || perms.manageCoOrganizers) && (
              <div className="flex items-center gap-1 shrink-0">
                {perms.editEvent && (
                  <button
                    onClick={() => setEditingEvent((v) => !v)}
                    aria-label="Editar evento"
                    className={`p-2 rounded-lg transition-colors ${
                      editingEvent
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <IconEdit className="w-4 h-4" />
                  </button>
                )}
                {perms.manageCoOrganizers && (
                  <button
                    onClick={() => setManageCoOrgOpen((v) => !v)}
                    aria-label="Coorganizadores"
                    title="Coorganizadores"
                    className={`relative p-2 rounded-lg transition-colors ${
                      manageCoOrgOpen
                        ? 'bg-primary/10 text-primary'
                        : 'text-gray-400 hover:text-primary hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <IconUserPlus className="w-4 h-4" />
                    {Object.entries(coOrgsMap).length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-primary text-white text-2xs leading-none font-semibold rounded-full w-4 h-4 flex items-center justify-center">
                        {Object.entries(coOrgsMap).length}
                      </span>
                    )}
                  </button>
                )}
              </div>
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
      {perms.editEvent && editingEvent && (
        <div className="mb-5">
          <EditEventForm event={event} onDone={() => setEditingEvent(false)} />
        </div>
      )}

      {/* Gestión de co-organizadores (inline, visible al hacer clic en el ícono junto al lápiz) */}
      {perms.manageCoOrganizers && <CoOrganizerPanel event={event} open={manageCoOrgOpen} coOrg={coOrg} />}

      {/* Un co-organizador (no el dueño) puede dejar de serlo sin depender de él */}
      {perms.isCoOrg && !perms.isOwner && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Eres co-organizador de este evento</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Puedes dejar de serlo cuando quieras.</p>
            </div>
            <button
              onClick={() => setConfirmLeave(true)}
              disabled={leaving}
              className="shrink-0 flex items-center gap-1.5 text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-3 py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
            >
              <IconLogOut className="w-4 h-4" />
              {leaving ? 'Saliendo…' : 'Salir del evento'}
            </button>
          </div>
          {actionError && (
            <p className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mt-3">
              {actionError}
            </p>
          )}
        </div>
      )}


      {/* ── AUTO-REGISTRO ── arriba y compacto: es de las acciones más usadas
          durante la organización (copiar/compartir el enlace), así que no
          debe requerir scroll hasta el final de la pantalla. */}
      {event.entryMode !== 'list' && (
        <div id="open-entry-links" className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-5">
          <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
            <IconLink className="w-3.5 h-3.5 text-primary" />
            Auto-registro
          </h2>
          <PublicLink
            label="Enlace de registro"
            desc="Los asistentes se registran y obtienen su QR propio"
            path={`/events/${event.id}/join`}
          />
          <div className="mt-3">
            <ShareEventButton event={event} />
          </div>
        </div>
      )}

      {/* ── RESUMEN RÁPIDO ── el detalle analítico completo (métricas, RSVP,
          recaudado, hora pico, línea de tiempo) vive en Reportes; acá solo el
          estado operativo que hace falta de un vistazo mientras se gestiona
          el evento. */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 p-4 mb-3">
        <AttendanceProgressBar
          present={event.checkedInCount}
          expected={totalPeople}
          unitLabel="check-ins"
          showPercentage
        />
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mt-3">
          <span>{event.guestCount} registrados</span>
          <span className="text-primary font-medium">{event.occupancyCount} dentro ahora</span>
        </div>
      </div>

      {/* Aviso siempre visible — el cupo es solo una capacidad recomendada,
          informativa, nunca bloquea nuevos registros. */}
      {event.capacity > 0 && totalPeople > event.capacity && (
        <p className="text-sm text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl px-4 py-3 mb-5">
          Este evento superó su cupo recomendado ({totalPeople} / {event.capacity} personas). Los nuevos registros
          siguen entrando — el ingreso el día del evento dependerá del orden de llegada.
        </p>
      )}

      {/* ── GESTIÓN DE INVITADOS ── */}
      {/* Toda la card queda detrás de viewGuestList: un coanfitrión sin ese
          permiso (ej. solo scanQr) nunca se suscribe a un dato que igual no
          puede ver — antes la página entera se rompía con un error genérico
          apenas rules rechazaba la suscripción a `guests`. */}
      {perms.viewGuestList && (
      <div id="add-guests" className="invite-card-accent border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden mb-5">
        {/* Formulario de agregar (según permiso addGuests) — sin importar el
            modo de entrada: firestore.rules ya lo permite en cualquier
            entryMode vía canDo('addGuests'), la restricción a "no open" era
            solo de esta UI (el organizador de un evento 100% autoregistro
            no tenía forma de cargar a mano a alguien que se anotó por
            teléfono, por ejemplo). */}
        {perms.addGuests && (
          <div className="p-5 border-b border-gray-100 dark:border-gray-700">
            <GuestAddForm eventId={event.id} guests={guests} customFields={event.customFields} maxCompanions={resolveMaxCompanions(event)} />
          </div>
        )}

        <div className="p-5">
          {guestsError && (
            <p className="text-sm text-red-500 mb-4">{guestsError}</p>
          )}
          {/* Encabezado + exportar */}
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Invitados
            </h2>
            {perms.exportLists && (
              <div className="flex items-center gap-3">
                {exporting ? (
                  <button onClick={handleCancelExport} className="text-xs text-red-500 font-medium hover:underline">
                    Cancelar {exportProgress ? `(${exportProgress.done}/${exportProgress.total})` : ''}
                  </button>
                ) : pendingExport ? (
                  // Esperando a que showAllGuests() termine de traer el
                  // resto de los invitados (ver requestExportPdf/Excel) antes
                  // de arrancar la exportación real.
                  <span className="text-xs text-gray-400 dark:text-gray-500">Preparando…</span>
                ) : (
                  <>
                    <button
                      onClick={requestExportExcel}
                      disabled={guests.length === 0}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-40 transition-colors"
                    >
                      Excel
                    </button>
                    <span className="text-gray-200 dark:text-gray-600 select-none">|</span>
                    <button
                      onClick={requestExportPdf}
                      disabled={guests.length === 0}
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-40 transition-colors"
                    >
                      PDF
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Barra de progreso de exportación Excel/PDF */}
          {exporting && exportProgress && exportProgress.total > 0 && (
            <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-3">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${(exportProgress.done / exportProgress.total) * 100}%` }}
              />
            </div>
          )}
          {(exportPdfError || exportExcelError) && (
            <p className="text-xs text-red-500 mb-3">{exportPdfError || exportExcelError}</p>
          )}

          {/* Fase 6: en eventos grandes, `guests` puede venir acotado a los
              primeros GUEST_WINDOW_DEFAULT (ver useEvent.ts) — nunca en
              silencio: este aviso explica por qué la lista de abajo no
              muestra a todos, y "Buscar y filtrar" ya trae al resto en
              cuanto se escribe algo (ver handleSearchChange). */}
          {guestsTruncated && (
            <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 mb-3">
              Mostrando los primeros {guests.length} de {event.guestCount} invitados. Usá la búsqueda para encontrar a cualquiera.
            </p>
          )}

          {/* Buscar y filtrar: un solo control abre el sheet con el input y
              los dos filtros que antes ocupaban tres filas separadas. */}
          {guests.length > 0 && (
            <button
              type="button"
              onClick={() => setGuestSearchSheetOpen(true)}
              className="w-full flex items-center gap-2.5 border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2.5 text-sm mb-4 bg-gray-50 dark:bg-gray-700 text-left hover:border-gray-300 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
            >
              <IconSearch className="w-4 h-4 text-gray-400 shrink-0" />
              <span className={`flex-1 truncate ${search ? 'text-gray-900 dark:text-white' : 'text-gray-400'}`}>
                {search || 'Buscar invitados'}
              </span>
              {activeFilterCount > 0 && (
                <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-primary text-white text-2xs font-semibold">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}

          <GuestList
            eventId={event.id}
            guests={filteredGuests}
            requiresPayment={event.requiresPayment}
            paymentMethods={event.paymentMethods}
            ticketPrice={event.ticketPrice}
            currency={event.currency}
            customFields={event.customFields}
            maxCompanions={resolveMaxCompanions(event)}
            hasActiveFilters={Boolean(search.trim()) || statusFilter !== 'all'}
            hasSearchText={Boolean(search.trim())}
            canEditGuests={perms.editGuests}
            canConfirmPayments={perms.confirmPayments}
            canDeleteGuests={perms.deleteGuests}
          />
        </div>
      </div>
      )}

      {/* ── RECORDATORIOS ── */}
      {perms.viewGuestList && guests.length > 0 && (
        <ReminderSection event={event} guests={guests} />
      )}

      {/* ── GESTIÓN DEL EVENTO (solo propietario, colapsable) ── */}
      {perms.isOwner && <EventManagementPanel event={event} actions={eventActions} />}

      <GuestSearchSheet
        open={guestSearchSheetOpen}
        search={search}
        onSearchChange={handleSearchChange}
        statusFilter={statusFilter}
        onStatusFilterChange={handleStatusFilterChange}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        resultCount={filteredGuests.length}
        onClose={() => setGuestSearchSheetOpen(false)}
      />

      {/* Diálogos de confirmación */}
      <ConfirmDialog
        open={confirmLeave}
        title="Salir del evento"
        message="Dejarás de ser co-organizador de este evento. El evento, sus invitados y el organizador principal no se ven afectados."
        confirmLabel={leaving ? 'Saliendo…' : 'Sí, salir'}
        cancelLabel="Cancelar"
        onConfirm={handleLeave}
        onCancel={() => setConfirmLeave(false)}
      />
    </>
  )

  return <div className="max-w-3xl mx-auto px-4 py-8 animate-fade-in">{content}</div>
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

  async function copy() {
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

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
    copy()
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">{label}</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{desc}</p>
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button
          onClick={copy}
          aria-label="Copiar enlace"
          title="Copiar enlace"
          className="p-2.5 rounded-lg border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-600 transition-colors"
        >
          {copied ? <IconCheck className="w-4 h-4 text-primary" /> : <IconCopy className="w-4 h-4" />}
        </button>
        <button
          onClick={share}
          aria-label="Compartir enlace"
          title="Compartir enlace"
          className="p-2.5 rounded-lg bg-primary text-white hover:opacity-90 transition-colors"
        >
          <IconShare className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
