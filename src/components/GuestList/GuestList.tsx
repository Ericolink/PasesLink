import { memo, useCallback, useState } from 'react'
import {
  allowGuestReentry,
  bulkDeleteGuests,
  bulkSetGuestPaymentStatus,
  bulkSetGuestTags,
  deleteGuest,
  moveGuestToWaitlist,
  resetGuestRsvp,
  setGuestPaymentStatus,
} from '../../firebase/guests'
import type { CustomField, DietaryRestriction, EntryMode, GuestData, GuestSegmentTag, MenuOption, PaymentMethod } from '../../types'
import { IconInbox } from '../accessibility/AccessibleIcon'
import { ConfirmDialog } from '../ConfirmDialog'
import { EmptyState } from '../Empty/EmptyState'
import { FormError } from '../FormError'
import { buildPassUrl } from '../../utils/qrUrl'
import { buildResendMailtoUrl, buildResendMessage, buildResendWhatsAppUrl } from '../../utils/resendInvitation'
import { trackGuestDelete } from '../../lib/analytics'
import { PAYMENT_METHOD_LABELS } from '../../utils/paymentMethods'
import { GuestDetailSheet } from './GuestDetailSheet'
import { GuestRow } from './GuestRow'
import { GuestSelectionBar } from './GuestSelectionBar'
import { SECTION_ORDER, groupGuestsByUrgency, guestSummaryBadges, sectionTitle, type GuestUrgency } from './guestGrouping'
import { ListSection, LoadMoreButton, LIST_SECTION_PAGE_SIZE } from './ListSection'
import { MetricTile } from '../MetricTile'
import { useAnnouncer } from '../accessibility/LiveRegion'
import { getFunctionsErrorMessage } from '../../utils/firebaseErrorMessages'

// `guests` ya llega completo a este componente (EventDetail lo carga entero
// vía useEvent/subscribeToGuests, que también alimenta las estadísticas, la
// búsqueda y el export CSV/PDF — truncar esa fuente rompería las tres). La
// paginación es solo de renderizado, ver ListSection.tsx.
const GUEST_LIST_PAGE_SIZE = LIST_SECTION_PAGE_SIZE

const SECTION_TONE: Record<GuestUrgency, 'amber' | 'violet' | 'gray'> = {
  attention: 'amber',
  confirmed_unpaid: 'violet',
  confirmed: 'gray',
  unanswered: 'gray',
  declined: 'gray',
}

export const GuestList = memo(function GuestList({
  eventId,
  eventName,
  guests,
  requiresPayment = false,
  entryMode = 'list',
  waitlistCount = 0,
  paymentMethods = [],
  ticketPrice = 0,
  currency = '',
  customFields = [],
  guestTags = [],
  menu,
  maxCompanions = 0,
  searchTerm = '',
  hasStatusFilter = false,
  onClearSearch,
  onClearFilters,
  // Defaults en `true`: sin permisos granulares (dueño, o co-organizador
  // legacy sin coOrganizerPermissions) el comportamiento es el mismo que
  // antes de esta feature — acceso total a estas 3 acciones.
  canEditGuests = true,
  canConfirmPayments = true,
  canDeleteGuests = true,
  attendeeLimitEnabled = false,
}: {
  eventId: string
  eventName: string
  guests: GuestData[]
  requiresPayment?: boolean
  entryMode?: EntryMode
  // Cuántas personas hay en lista de espera ahora mismo (waiting + offered,
  // mismo criterio que WaitlistPanel) — GuestList no se suscribe a esa
  // colección, EventDetail.tsx se la pasa ya calculada. Solo se usa para
  // decidir si el badge "Lista de espera" del resumen aparece (>0).
  waitlistCount?: number
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  customFields?: CustomField[]
  guestTags?: GuestSegmentTag[]
  menu?: { options: MenuOption[]; restrictions: DietaryRestriction[] }
  maxCompanions?: number
  // Texto de búsqueda ya aplicado (mismo que filtró `guests`) — distingue
  // "todavía no hay invitados" de "ninguno coincide con lo que buscas", y
  // permite mostrarlo textualmente en el estado vacío.
  searchTerm?: string
  // Filtro de estado (Confirmados/Pendientes/etc.) aplicado — a diferencia
  // del orden, que nunca produce cero resultados.
  hasStatusFilter?: boolean
  onClearSearch?: () => void
  onClearFilters?: () => void
  canEditGuests?: boolean
  canConfirmPayments?: boolean
  canDeleteGuests?: boolean
  attendeeLimitEnabled?: boolean
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingGuest, setDeletingGuest] = useState<GuestData | null>(null)
  const [reentryGuest, setReentryGuest] = useState<GuestData | null>(null)
  const [sendingToWaitlistGuest, setSendingToWaitlistGuest] = useState<GuestData | null>(null)
  // Solo el id, no el GuestData completo: una copia congelada del invitado
  // no se actualizaba cuando el listener de Firestore traía el resultado de
  // confirmar/revertir un pago (o cualquier otro cambio) mientras el detalle
  // seguía abierto — el organizador tocaba "Confirmar pago", el pase SÍ
  // quedaba pagado del lado del servidor, pero el modal seguía mostrando
  // "Pendiente" hasta cerrarlo y volver a abrirlo (o recargar la página).
  // Derivar `detailGuest` de `guests` en cada render lo mantiene en vivo.
  const [detailGuestId, setDetailGuestId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [visibleCount, setVisibleCount] = useState(GUEST_LIST_PAGE_SIZE)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)
  // Solo se usa cuando el evento acepta 2+ métodos: con uno solo,
  // bulkMarkPaid dispara directo (mismo criterio que GuestDetailSheet/Scanner).
  const [bulkMarkPaidConfirmOpen, setBulkMarkPaidConfirmOpen] = useState(false)
  const [bulkPaymentMethod, setBulkPaymentMethod] = useState<PaymentMethod | undefined>(undefined)
  const { announce } = useAnnouncer()

  // Este useCallback tiene que vivir ANTES del early return de "sin
  // invitados" (regla de hooks: siempre en el mismo orden, nunca detrás de
  // un return condicional), aunque conceptualmente sea parte del bloque de
  // acciones sobre filas más abajo.

  // useCallback (deps vacíos: solo usa el updater funcional de setSelected)
  // — es una de las props que rowProps le pasa a cada GuestRow (memo, ver
  // GuestRow.tsx). Sin esto, GuestList recreaba esta función en cada render
  // y anulaba el memo de CADA fila visible ante cualquier cambio (ej. un
  // check-in de OTRO invitado durante una hora pico de puerta), no solo la
  // fila que de verdad cambió.
  const toggleSelect = useCallback((guest: GuestData) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(guest.id)) next.delete(guest.id)
      else next.add(guest.id)
      return next
    })
  }, [])

  const hasSearchText = Boolean(searchTerm.trim())

  if (guests.length === 0) {
    if (hasSearchText && hasStatusFilter) {
      return (
        <EmptyState
          icon={IconInbox}
          title="Sin resultados"
          description="No encontramos invitados que coincidan con tu búsqueda y filtros."
          ctaText="Limpiar búsqueda y filtros"
          onAction={() => { onClearSearch?.(); onClearFilters?.() }}
        />
      )
    }
    if (hasSearchText) {
      return (
        <EmptyState
          icon={IconInbox}
          title="Sin resultados"
          description={`No encontramos invitados que coincidan con "${searchTerm.trim()}".`}
          ctaText="Limpiar búsqueda"
          onAction={onClearSearch}
        />
      )
    }
    if (hasStatusFilter) {
      return (
        <EmptyState
          icon={IconInbox}
          title="Sin resultados"
          description="Ningún invitado coincide con ese filtro."
          ctaText="Limpiar filtros"
          onAction={onClearFilters}
        />
      )
    }
    return (
      <EmptyState
        icon={IconInbox}
        title="Todavía no hay invitados"
        description="Agrega tu primer invitado para empezar a armar la lista."
      />
    )
  }

  // Relanza el error después de guardarlo acá (para el banner de la lista,
  // que puede seguir siendo relevante si el organizador ya cerró el detalle)
  // — GuestDetailSheet también atrapa esta misma promesa para mostrar su
  // propio error inline y su propio estado de carga mientras el modal sigue
  // abierto, que es donde el organizador está mirando en el momento (antes,
  // el único feedback vivía en este banner, tapado por el modal — el
  // organizador no veía nada hasta cerrar y recargar).
  async function handleMarkPaid(guest: GuestData, method?: PaymentMethod) {
    setActionError('')
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'paid', method)
      announce(`Pago confirmado: ${guest.name}`)
    } catch (err) {
      console.error('Error marking guest as paid:', err)
      const message = getFunctionsErrorMessage(err, 'No se pudo actualizar el estado de pago. Intenta de nuevo.')
      setActionError(message)
      throw new Error(message)
    }
  }

  async function handleMarkUnpaid(guest: GuestData) {
    setActionError('')
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'unpaid')
      announce(`Pago revertido: ${guest.name}`)
    } catch (err) {
      console.error('Error marking guest as unpaid:', err)
      const message = getFunctionsErrorMessage(err, 'No se pudo actualizar el estado de pago. Intenta de nuevo.')
      setActionError(message)
      throw new Error(message)
    }
  }

  async function handleSetGuestTags(guest: GuestData, tagIds: string[]) {
    setActionError('')
    const { failed } = await bulkSetGuestTags(eventId, [guest.id], tagIds)
    if (failed > 0) setActionError('No se pudieron actualizar los segmentos. Intenta de nuevo.')
  }

  async function handleReactivate(guest: GuestData) {
    setActionError('')
    try {
      await resetGuestRsvp(eventId, guest.id)
    } catch (err) {
      console.error('Error reactivating guest invitation:', err)
      setActionError('No se pudo reactivar la invitación. Intenta de nuevo.')
    }
  }

  async function handleShare(guest: GuestData) {
    const url = buildPassUrl(eventId, guest.qrToken)
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Tu invitación', text: `Aquí está tu invitación, ${guest.name}`, url })
        return
      } catch {
        return
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(guest.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch (err) {
      console.error('Error copying invitation link:', err)
      setActionError('No se pudo copiar el link. Intenta de nuevo.')
    }
  }

  // Reenvío del link ya existente (mismo qrToken) por WhatsApp/correo — ver
  // src/utils/resendInvitation.ts. Deep-links (wa.me/mailto), no envío desde
  // el backend: abre la app del propio organizador con todo prellenado, no
  // toca Firestore ni genera un token nuevo.
  function handleResend(guest: GuestData, channel: 'whatsapp' | 'email') {
    const message = buildResendMessage(guest.name, eventName, eventId, guest.qrToken)
    if (channel === 'whatsapp' && guest.phone) {
      window.open(buildResendWhatsAppUrl(guest.phone, message, guest.phoneCountry), '_blank', 'noopener,noreferrer')
    } else if (channel === 'email' && guest.email) {
      window.location.href = buildResendMailtoUrl(guest.email, eventName, message)
    }
  }

  async function confirmDelete() {
    if (!deletingGuest) return
    setActionError('')
    try {
      await deleteGuest(eventId, deletingGuest)
      trackGuestDelete(eventId)
      announce(`Invitado eliminado: ${deletingGuest.name}`)
    } catch (err) {
      console.error('Error deleting guest:', err)
      setActionError('No se pudo eliminar el invitado. Intenta de nuevo.')
    } finally {
      setDeletingGuest(null)
    }
  }

  async function confirmAllowReentry() {
    if (!reentryGuest) return
    setActionError('')
    try {
      await allowGuestReentry(eventId, reentryGuest.id)
    } catch (err) {
      console.error('Error allowing guest reentry:', err)
      setActionError('No se pudo habilitar el reingreso. Intenta de nuevo.')
    } finally {
      setReentryGuest(null)
    }
  }

  async function confirmSendToWaitlist() {
    if (!sendingToWaitlistGuest) return
    setActionError('')
    try {
      await moveGuestToWaitlist(eventId, sendingToWaitlistGuest)
      announce(`Enviado a la lista de espera: ${sendingToWaitlistGuest.name}`)
    } catch (err) {
      console.error('Error sending guest to waitlist:', err)
      setActionError('No se pudo enviar a la lista de espera. Intenta de nuevo.')
    } finally {
      setSendingToWaitlistGuest(null)
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  async function bulkMarkPaid() {
    setActionError('')
    const targets = guests.filter((g) => selected.has(g.id))
    const { failed } = await bulkSetGuestPaymentStatus(eventId, targets.map((g) => g.id), 'paid', bulkPaymentMethod ?? paymentMethods[0])
    if (failed > 0) setActionError(`No se pudo marcar como pagado a ${failed} de ${targets.length} invitados.`)
    setBulkMarkPaidConfirmOpen(false)
    setBulkPaymentMethod(undefined)
    exitSelectMode()
  }

  // Con 2+ métodos habilitados, un solo método aplicado a todo el lote no se
  // puede asumir en silencio (mezclar transferencia/efectivo en una sola
  // acción masiva no tiene sentido) — se pide confirmación explícita. Con
  // uno solo, se dispara directo (mismo criterio que el resto de los
  // confirmadores de pago).
  function requestBulkMarkPaid() {
    if (paymentMethods.length > 1) {
      setBulkPaymentMethod(undefined)
      setBulkMarkPaidConfirmOpen(true)
    } else {
      void bulkMarkPaid()
    }
  }

  async function bulkDelete() {
    setActionError('')
    const targets = guests.filter((g) => selected.has(g.id))
    const { failed } = await bulkDeleteGuests(eventId, targets)
    if (targets.length - failed > 0) trackGuestDelete(eventId)
    if (failed > 0) setActionError(`No se pudo eliminar a ${failed} de ${targets.length} invitados.`)
    setBulkDeleteConfirmOpen(false)
    exitSelectMode()
  }

  const rowProps = {
    requiresPayment,
    ticketPrice,
    currency,
    selectMode,
    onToggleSelect: toggleSelect,
    onOpenDetail: (guest: GuestData) => setDetailGuestId(guest.id),
  }

  const detailGuest = detailGuestId ? guests.find((g) => g.id === detailGuestId) ?? null : null
  const visibleGuests = guests.slice(0, visibleCount)
  const hasMoreToShow = guests.length > visibleCount
  const groups = hasSearchText ? null : groupGuestsByUrgency(guests, requiresPayment)

  return (
    <div className="space-y-3 pb-16">
      <FormError message={actionError} />

      {/* Sin esto, un coanfitrión sin deleteGuests ni confirmPayments podía
          activar el modo selección igual y terminar viendo una barra
          (GuestSelectionBar) con solo el botón "Cancelar" — ninguna acción
          real disponible. */}
      {(canDeleteGuests || (requiresPayment && canConfirmPayments)) && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="text-xs font-semibold text-primary hover:underline"
          >
            {selectMode ? 'Cancelar selección' : 'Seleccionar'}
          </button>
        </div>
      )}

      {groups ? (
        <div className="space-y-4">
          {/* Única fuente visible de "cuántos hay": el badge chico que
              ListSection mostraba en su propio encabezado se ocultó
              (hideCount) para no duplicar el mismo número dos veces en la
              misma pantalla. Qué 2-3 tarjetas se arman depende de cómo
              llegan los invitados a la lista (entryMode) y de si el evento
              cobra — ver guestSummaryBadges. Se oculta junto con las
              secciones al buscar (groups === null), porque deja de
              representar "todo el evento". */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {guestSummaryBadges(groups, guests.length, entryMode, requiresPayment, waitlistCount).map((badge) => (
              <MetricTile key={badge.label} label={badge.label} value={badge.count} sub={badge.sub} accent={badge.accent} />
            ))}
          </div>

          {SECTION_ORDER.map((section) => (
            <ListSection
              key={section.key}
              title={sectionTitle(section.key, requiresPayment)}
              titleTone={SECTION_TONE[section.key]}
              alwaysExpanded={section.key === 'attention'}
              collapsedByDefault={section.collapsedByDefault}
              items={groups[section.key]}
              hideCount
              renderItem={(guest) => <GuestRow key={guest.id} guest={guest} selected={selected.has(guest.id)} {...rowProps} />}
            />
          ))}
        </div>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {visibleGuests.map((guest) => (
            <GuestRow key={guest.id} guest={guest} selected={selected.has(guest.id)} {...rowProps} />
          ))}
        </div>
      )}
      {!groups && hasMoreToShow && (
        <LoadMoreButton remaining={guests.length - visibleCount} onClick={() => setVisibleCount((c) => c + GUEST_LIST_PAGE_SIZE)} />
      )}

      {selectMode && (
        <GuestSelectionBar
          count={selected.size}
          requiresPayment={requiresPayment}
          canConfirmPayments={canConfirmPayments}
          canDeleteGuests={canDeleteGuests}
          onMarkPaid={requestBulkMarkPaid}
          onDelete={() => setBulkDeleteConfirmOpen(true)}
          onCancel={exitSelectMode}
        />
      )}

      <GuestDetailSheet
        eventId={eventId}
        guest={detailGuest}
        requiresPayment={requiresPayment}
        paymentMethods={paymentMethods}
        ticketPrice={ticketPrice}
        currency={currency}
        customFields={customFields}
        guestTags={guestTags}
        menu={menu}
        maxCompanions={maxCompanions}
        copiedId={copiedId}
        canEditGuests={canEditGuests}
        canConfirmPayments={canConfirmPayments}
        canDeleteGuests={canDeleteGuests}
        attendeeLimitEnabled={attendeeLimitEnabled}
        onClose={() => setDetailGuestId(null)}
        onShare={handleShare}
        onResend={handleResend}
        onMarkPaid={handleMarkPaid}
        onMarkUnpaid={handleMarkUnpaid}
        onSetTags={handleSetGuestTags}
        onRequestDelete={(guest) => { setDetailGuestId(null); setDeletingGuest(guest) }}
        onRequestReentry={(guest) => { setDetailGuestId(null); setReentryGuest(guest) }}
        onReactivate={handleReactivate}
        onRequestSendToWaitlist={(guest) => { setDetailGuestId(null); setSendingToWaitlistGuest(guest) }}
      />

      <ConfirmDialog
        open={!!deletingGuest}
        title="Eliminar invitado"
        message={`¿Eliminar a ${deletingGuest?.name} ${deletingGuest?.lastName || ''}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeletingGuest(null)}
      />
      <ConfirmDialog
        open={!!sendingToWaitlistGuest}
        title="Enviar a lista de espera"
        message={`"${sendingToWaitlistGuest?.name} ${sendingToWaitlistGuest?.lastName || ''}" deja de estar en la lista de invitados y su lugar queda libre — si alguien más está esperando cupo, se le ofrece automáticamente. Puedes reincorporarlo desde la lista de espera si aparece más tarde.`}
        confirmLabel="Enviar a lista de espera"
        onConfirm={confirmSendToWaitlist}
        onCancel={() => setSendingToWaitlistGuest(null)}
      />
      <ConfirmDialog
        open={!!reentryGuest}
        title="Permitir reingreso"
        message={`"${reentryGuest?.name} ${reentryGuest?.lastName || ''}" se retiró definitivamente del evento. Esto habilita que vuelva a entrar escaneando su mismo pase.`}
        confirmLabel="Permitir reingreso"
        onConfirm={confirmAllowReentry}
        onCancel={() => setReentryGuest(null)}
      />
      <ConfirmDialog
        open={bulkDeleteConfirmOpen}
        title="Eliminar invitados"
        message={`¿Eliminar a ${selected.size} invitados seleccionados? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={bulkDelete}
        onCancel={() => setBulkDeleteConfirmOpen(false)}
      />
      <ConfirmDialog
        open={bulkMarkPaidConfirmOpen}
        title="Confirmar pago"
        message={
          <div className="space-y-3">
            <p>¿Marcar como pagados a los {selected.size} invitados seleccionados?</p>
            <div>
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Método de pago</p>
              <div className="flex gap-2">
                {paymentMethods.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setBulkPaymentMethod(m)}
                    aria-pressed={(bulkPaymentMethod ?? paymentMethods[0]) === m}
                    className={`flex-1 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                      (bulkPaymentMethod ?? paymentMethods[0]) === m
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'
                    }`}
                  >
                    {PAYMENT_METHOD_LABELS[m]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        }
        confirmLabel="Marcar como pagado"
        onConfirm={bulkMarkPaid}
        onCancel={() => { setBulkMarkPaidConfirmOpen(false); setBulkPaymentMethod(undefined) }}
      />
    </div>
  )
})
