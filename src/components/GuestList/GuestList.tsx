import { memo, useState } from 'react'
import {
  allowGuestReentry,
  deleteGuest,
  resetGuestRsvp,
  setGuestPaymentStatus,
  unlockGuestPass,
} from '../../firebase/guests'
import type { GuestData, PaymentMethod } from '../../types'
import { IconChevronDown, IconInbox } from '../Icons'
import { ConfirmDialog } from '../ConfirmDialog'
import { buildPassUrl } from '../../utils/qrUrl'
import { GuestDetailSheet } from './GuestDetailSheet'
import { GuestRow } from './GuestRow'
import { GuestSelectionBar } from './GuestSelectionBar'
import { SECTION_ORDER, groupGuestsByUrgency, type GuestUrgency } from './guestGrouping'

// Paginación de RENDERIZADO, no de datos: `guests` ya llega completo a este
// componente (EventDetail lo carga entero vía useEvent/subscribeToGuests,
// que también alimenta las estadísticas, la búsqueda y el export CSV/PDF —
// truncar esa fuente rompería las tres). Cada sección de urgencia pagina por
// separado (ver GuestSection) para no pintar cientos de filas a la vez.
const GUEST_LIST_PAGE_SIZE = 50

function LoadMoreButton({ remaining, onClick }: { remaining: number; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-sm text-primary font-medium py-2.5 hover:underline">
      Cargar más invitados ({remaining} restantes)
    </button>
  )
}

function GuestSection({
  sectionKey,
  title,
  alwaysExpanded,
  collapsedByDefault,
  guests,
  selectedIds,
  rowProps,
}: {
  sectionKey: GuestUrgency
  title: string
  alwaysExpanded: boolean
  collapsedByDefault: boolean
  guests: GuestData[]
  selectedIds: Set<string>
  rowProps: Omit<React.ComponentProps<typeof GuestRow>, 'guest' | 'selected'>
}) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault)
  const [visibleCount, setVisibleCount] = useState(GUEST_LIST_PAGE_SIZE)

  if (guests.length === 0) return null
  const expanded = alwaysExpanded || !collapsed
  const visible = guests.slice(0, visibleCount)

  return (
    <div>
      <button
        type="button"
        onClick={() => !alwaysExpanded && setCollapsed((c) => !c)}
        className={`w-full flex items-center justify-between gap-2 px-1 py-2 ${alwaysExpanded ? 'cursor-default' : ''}`}
      >
        <span className={`text-xs font-bold uppercase tracking-wide ${sectionKey === 'attention' ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-gray-500'}`}>
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
            {guests.length}
          </span>
          {!alwaysExpanded && (
            <IconChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          )}
        </span>
      </button>
      {expanded && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {visible.map((guest) => (
            <GuestRow key={guest.id} guest={guest} selected={selectedIds.has(guest.id)} {...rowProps} />
          ))}
          {guests.length > visibleCount && (
            <LoadMoreButton remaining={guests.length - visibleCount} onClick={() => setVisibleCount((c) => c + GUEST_LIST_PAGE_SIZE)} />
          )}
        </div>
      )}
    </div>
  )
}

export const GuestList = memo(function GuestList({
  eventId,
  guests,
  requiresPayment = false,
  paymentMethods = [],
  ticketPrice = 0,
  currency = '',
  hasActiveFilters = false,
  hasSearchText = false,
}: {
  eventId: string
  guests: GuestData[]
  requiresPayment?: boolean
  paymentMethods?: PaymentMethod[]
  ticketPrice?: number
  currency?: string
  // true cuando `guests` ya viene reducido por búsqueda/filtro de estado (no
  // por el orden, que nunca produce cero resultados) — distingue "todavía no
  // hay invitados" de "ninguno coincide con lo que buscás", que antes
  // compartían el mismo mensaje.
  hasActiveFilters?: boolean
  // Solo la mitad "hay texto de búsqueda" de hasActiveFilters: con texto
  // activo se muestra la lista plana filtrada (pocos resultados, agrupar
  // agregaría ruido); sin texto se agrupa por urgencia aunque haya un filtro
  // de estado aplicado.
  hasSearchText?: boolean
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingGuest, setDeletingGuest] = useState<GuestData | null>(null)
  const [unlockingGuest, setUnlockingGuest] = useState<GuestData | null>(null)
  const [reentryGuest, setReentryGuest] = useState<GuestData | null>(null)
  const [detailGuest, setDetailGuest] = useState<GuestData | null>(null)
  const [actionError, setActionError] = useState('')
  const [visibleCount, setVisibleCount] = useState(GUEST_LIST_PAGE_SIZE)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false)

  if (guests.length === 0) {
    return (
      <div className="text-center py-8 animate-fade-in">
        <IconInbox className="w-8 h-8 mb-2 mx-auto text-gray-300" />
        <p className="text-sm text-gray-500">
          {hasActiveFilters ? 'Ningún invitado coincide con esa búsqueda o filtro.' : 'Todavía no agregaste invitados.'}
        </p>
      </div>
    )
  }

  function resolveMethod(guest: GuestData): PaymentMethod | undefined {
    return guest.paymentMethod || paymentMethods[0]
  }

  async function handleMarkPaid(guest: GuestData, method?: PaymentMethod) {
    setActionError('')
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'paid', method)
    } catch (err) {
      console.error('Error marking guest as paid:', err)
      // setGuestPaymentStatus puede rechazar el reclamo de una reserva
      // vencida si el cupo ya se llenó con alguien de la lista de espera —
      // ese mensaje es más útil que el genérico, así que se muestra tal cual.
      setActionError(err instanceof Error ? err.message : 'No se pudo actualizar el estado de pago. Intenta de nuevo.')
    }
  }

  async function handleMarkUnpaid(guest: GuestData) {
    setActionError('')
    try {
      await setGuestPaymentStatus(eventId, guest.id, 'unpaid')
    } catch (err) {
      console.error('Error marking guest as unpaid:', err)
      setActionError('No se pudo actualizar el estado de pago. Intenta de nuevo.')
    }
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

  async function confirmDelete() {
    if (!deletingGuest) return
    setActionError('')
    try {
      await deleteGuest(eventId, deletingGuest)
    } catch (err) {
      console.error('Error deleting guest:', err)
      setActionError('No se pudo eliminar el invitado. Intenta de nuevo.')
    } finally {
      setDeletingGuest(null)
    }
  }

  async function confirmUnlock() {
    if (!unlockingGuest) return
    setActionError('')
    try {
      await unlockGuestPass(eventId, unlockingGuest.id)
    } catch (err) {
      console.error('Error unlocking guest pass:', err)
      setActionError('No se pudo desbloquear el pase. Intenta de nuevo.')
    } finally {
      setUnlockingGuest(null)
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

  function toggleSelect(guest: GuestData) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(guest.id)) next.delete(guest.id)
      else next.add(guest.id)
      return next
    })
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }

  async function bulkMarkPaid() {
    setActionError('')
    const targets = guests.filter((g) => selected.has(g.id))
    const results = await Promise.allSettled(targets.map((g) => setGuestPaymentStatus(eventId, g.id, 'paid', resolveMethod(g))))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) setActionError(`No se pudo marcar como pagado a ${failed} de ${targets.length} invitados.`)
    exitSelectMode()
  }

  async function bulkDelete() {
    setActionError('')
    const targets = guests.filter((g) => selected.has(g.id))
    const results = await Promise.allSettled(targets.map((g) => deleteGuest(eventId, g)))
    const failed = results.filter((r) => r.status === 'rejected').length
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
    onOpenDetail: setDetailGuest,
    onQuickPay: (guest: GuestData) => handleMarkPaid(guest, resolveMethod(guest)),
    onQuickDeleteRequest: setDeletingGuest,
  }

  const visibleGuests = guests.slice(0, visibleCount)
  const hasMoreToShow = guests.length > visibleCount
  const groups = hasSearchText ? null : groupGuestsByUrgency(guests, requiresPayment)

  return (
    <div className="space-y-3 pb-16">
      {actionError && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">{actionError}</p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {selectMode ? 'Cancelar selección' : 'Seleccionar'}
        </button>
      </div>

      {groups ? (
        <div className="space-y-4">
          {SECTION_ORDER.map((section) => (
            <GuestSection
              key={section.key}
              sectionKey={section.key}
              title={section.title}
              alwaysExpanded={section.key === 'attention'}
              collapsedByDefault={section.collapsedByDefault}
              guests={groups[section.key]}
              selectedIds={selected}
              rowProps={rowProps}
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
          onMarkPaid={bulkMarkPaid}
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
        copiedId={copiedId}
        onClose={() => setDetailGuest(null)}
        onShare={handleShare}
        onMarkPaid={handleMarkPaid}
        onMarkUnpaid={handleMarkUnpaid}
        onRequestDelete={(guest) => { setDetailGuest(null); setDeletingGuest(guest) }}
        onRequestUnlock={(guest) => { setDetailGuest(null); setUnlockingGuest(guest) }}
        onRequestReentry={(guest) => { setDetailGuest(null); setReentryGuest(guest) }}
        onReactivate={handleReactivate}
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
        open={!!unlockingGuest}
        title="Desbloquear pase"
        message={`Esto permite que "${unlockingGuest?.name} ${unlockingGuest?.lastName || ''}" abra su pase desde un dispositivo distinto al que lo bloqueó (por ejemplo, si cambió de teléfono). No afecta su confirmación de asistencia ni su check-in.`}
        confirmLabel="Desbloquear"
        onConfirm={confirmUnlock}
        onCancel={() => setUnlockingGuest(null)}
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
    </div>
  )
})
