import { memo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { allowGuestReentry, deleteGuest, guestPresence, resetGuestRsvp, setGuestPaymentStatus, unlockGuestPass, updateGuest } from '../firebase/guests'
import { getGuestCheckins } from '../firebase/reports'
import type { CheckinLog, CompanionData, GuestData } from '../types'
import { RSVP_LABELS } from '../types'
import {
  IconCheck,
  IconCheckCircle,
  IconClock,
  IconEdit,
  IconEye,
  IconHelpCircle,
  IconInbox,
  IconLogOut,
  IconRotateCcw,
  IconShare,
  IconTicket,
  IconTrash,
  IconX,
} from './Icons'
import { ConfirmDialog } from './ConfirmDialog'
import { CompanionFieldsEditor } from './CompanionFields'
import { buildPassUrl } from '../utils/qrUrl'

// Paginación de RENDERIZADO, no de datos: `guests` ya llega completo a este
// componente (EventDetail lo carga entero vía useEvent/subscribeToGuests,
// que también alimenta las estadísticas, la búsqueda y el export CSV/PDF —
// truncar esa fuente rompería las tres). Lo único que escala mal en eventos
// grandes es el DOM: cada fila tiene varios botones/badges, y renderizar
// cientos de filas de una sola vez es el costo real. `visibleCount` solo
// limita cuántas de las filas YA CARGADAS se pintan, sin ninguna lectura
// adicional a Firestore.
const GUEST_LIST_PAGE_SIZE = 50

function GuestStatusBadge({ guest }: { guest: GuestData }) {
  const presence = guestPresence(guest)

  const { label, classes, Icon } = presence === 'inside'
    ? { label: 'Adentro', classes: 'bg-blue-50 text-blue-700', Icon: IconCheckCircle }
    : presence === 'temp_out'
      ? { label: 'Salida temporal', classes: 'bg-amber-50 text-amber-700', Icon: IconLogOut }
      : presence === 'final_out'
        ? { label: 'Fuera del evento', classes: 'bg-gray-100 text-gray-500', Icon: IconLogOut }
        : guest.rsvpStatus === 'yes'
          ? { label: 'Asistirá', classes: 'bg-green-50 text-green-700', Icon: IconCheck }
          : guest.rsvpStatus === 'no'
            ? { label: 'No asistirá', classes: 'bg-gray-100 text-gray-500', Icon: IconX }
            : { label: 'Sin responder', classes: 'bg-amber-50 text-amber-700', Icon: IconHelpCircle }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full shrink-0 ${classes}`}>
      <Icon className="w-3.5 h-3.5" />
      {label}
    </span>
  )
}

function formatCheckinEntryLabel(c: CheckinLog): string {
  if (c.type === 'check_out') return c.exitKind === 'final' ? 'Salida definitiva' : 'Salida temporal'
  return c.reentry ? 'Reingreso' : 'Entrada'
}

function GuestHistory({ eventId, guestId }: { eventId: string; guestId: string }) {
  const [entries, setEntries] = useState<CheckinLog[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    getGuestCheckins(eventId, guestId)
      .then(setEntries)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [eventId, guestId])

  if (loading) return <p className="text-xs text-gray-400 px-3 pb-3">Cargando historial…</p>
  if (error) return <p className="text-xs text-red-500 px-3 pb-3">No se pudo cargar el historial.</p>
  if (!entries || entries.length === 0) return <p className="text-xs text-gray-400 px-3 pb-3">Sin movimientos registrados.</p>

  return (
    <ul className="px-3 pb-3 space-y-1">
      {entries.map((c) => (
        <li key={c.id} className="flex items-center justify-between text-xs text-gray-600 gap-2">
          <span className="inline-flex items-center gap-1.5">
            <IconClock className="w-3 h-3 text-gray-400 shrink-0" />
            {formatCheckinEntryLabel(c)}
            {c.scannedByEmail && <span className="text-gray-400"> · {c.scannedByEmail}</span>}
          </span>
          <span className="text-gray-400 shrink-0">{new Date(c.timestamp).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
        </li>
      ))}
    </ul>
  )
}

export const GuestList = memo(function GuestList({
  eventId,
  guests,
  requiresPayment = false,
  ticketPrice = 0,
  currency = '',
}: {
  eventId: string
  guests: GuestData[]
  requiresPayment?: boolean
  ticketPrice?: number
  currency?: string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [deletingGuest, setDeletingGuest] = useState<GuestData | null>(null)
  const [unlockingGuest, setUnlockingGuest] = useState<GuestData | null>(null)
  const [reentryGuest, setReentryGuest] = useState<GuestData | null>(null)
  const [historyOpenId, setHistoryOpenId] = useState<string | null>(null)
  const [actionError, setActionError] = useState('')
  const [visibleCount, setVisibleCount] = useState(GUEST_LIST_PAGE_SIZE)

  if (guests.length === 0) {
    return (
      <div className="text-center py-8 animate-fade-in">
        <IconInbox className="w-8 h-8 mb-2 mx-auto text-gray-300" />
        <p className="text-sm text-gray-500">Todavía no agregaste invitados.</p>
      </div>
    )
  }

  async function confirmDelete() {
    if (!deletingGuest) return
    setActionError('')
    try {
      await deleteGuest(eventId, deletingGuest.id, deletingGuest.status === 'checked_in')
    } catch (err) {
      console.error('Error deleting guest:', err)
      setActionError('No se pudo eliminar el invitado. Intenta de nuevo.')
    } finally {
      setDeletingGuest(null)
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

  async function handleTogglePayment(guest: GuestData) {
    setActionError('')
    try {
      await setGuestPaymentStatus(eventId, guest.id, guest.paymentStatus === 'paid' ? 'unpaid' : 'paid')
    } catch (err) {
      console.error('Error updating guest payment status:', err)
      setActionError('No se pudo actualizar el estado de pago. Intenta de nuevo.')
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

  const visibleGuests = guests.slice(0, visibleCount)
  const hasMoreToShow = guests.length > visibleCount

  return (
    <div className="space-y-2">
      {actionError && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">{actionError}</p>
      )}
      {visibleGuests.map((guest) =>
        editingId === guest.id ? (
          <EditGuestRow key={guest.id} eventId={eventId} guest={guest} onDone={() => setEditingId(null)} />
        ) : (
          <div key={guest.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm break-words">
                  {guest.name} {guest.lastName}
                  {guest.companions.length > 0 && (
                    <span className="text-gray-400 font-normal"> +{guest.companions.length}</span>
                  )}
                </p>
                {guest.phone && <p className="text-xs text-gray-500 truncate">{guest.phone}</p>}
              </div>
              <GuestStatusBadge guest={guest} />
            </div>
            {guest.rsvpStatus !== 'pending' && (
              <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    guest.rsvpStatus === 'yes' ? 'bg-blue-50 text-primary' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {RSVP_LABELS[guest.rsvpStatus]}
                </span>
                {guest.rsvpStatus === 'no' && (
                  <button onClick={() => handleReactivate(guest)} className="text-xs text-primary font-medium">
                    Reactivar invitación
                  </button>
                )}
              </div>
            )}
            {guestPresence(guest) === 'final_out' && (
              <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
                <button
                  onClick={() => setReentryGuest(guest)}
                  className="flex items-center gap-1 text-xs text-primary font-medium"
                >
                  <IconRotateCcw className="w-3.5 h-3.5" />
                  Permitir reingreso
                </button>
              </div>
            )}
            {guest.status === 'checked_in' && (
              <div className="px-3 pb-3">
                <button
                  onClick={() => setHistoryOpenId(historyOpenId === guest.id ? null : guest.id)}
                  className="text-xs text-gray-500 font-medium underline underline-offset-2"
                >
                  {historyOpenId === guest.id ? 'Ocultar historial' : 'Ver historial de accesos'}
                </button>
              </div>
            )}
            {historyOpenId === guest.id && <GuestHistory eventId={eventId} guestId={guest.id} />}
            {guest.lockToken && (
              <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-700">
                  Pase abierto en un dispositivo
                </span>
                <button
                  onClick={() => setUnlockingGuest(guest)}
                  className="flex items-center gap-1 text-xs text-primary font-medium"
                >
                  <IconRotateCcw className="w-3.5 h-3.5" />
                  Desbloquear pase
                </button>
              </div>
            )}
            {requiresPayment && (
              <div className="px-3 pb-3 flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    guest.paymentStatus === 'paid' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  <IconTicket className="w-3.5 h-3.5" />
                  {guest.paymentStatus === 'paid'
                    ? 'Pagó'
                    : `Pendiente · ${currency}${(ticketPrice * (1 + guest.companions.length)).toLocaleString('es')}`}
                </span>
                <button onClick={() => handleTogglePayment(guest)} className="text-xs text-primary font-medium">
                  {guest.paymentStatus === 'paid' ? 'Marcar como no pagado' : 'Marcar como pagado'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100">
              <button
                onClick={() => handleShare(guest)}
                className="flex flex-col items-center justify-center gap-1 py-3 min-h-12 text-xs text-primary font-medium hover:bg-gray-50 transition-colors"
              >
                <IconShare className="w-4 h-4" />
                {copiedId === guest.id ? 'Copiado!' : 'Compartir'}
              </button>
              <Link
                to={`/pass/${eventId}/${guest.qrToken}`}
                target="_blank"
                className="flex flex-col items-center justify-center gap-1 py-3 min-h-12 text-xs text-primary font-medium hover:bg-gray-50 transition-colors"
              >
                <IconEye className="w-4 h-4" />
                Ver pase
              </Link>
              <button
                onClick={() => setEditingId(guest.id)}
                className="flex flex-col items-center justify-center gap-1 py-3 min-h-12 text-xs text-gray-500 font-medium hover:bg-gray-50 transition-colors"
              >
                <IconEdit className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => setDeletingGuest(guest)}
                className="flex flex-col items-center justify-center gap-1 py-3 min-h-12 text-xs text-red-500 font-medium hover:bg-red-50 transition-colors"
              >
                <IconTrash className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        ),
      )}
      {hasMoreToShow && (
        <button
          onClick={() => setVisibleCount((c) => c + GUEST_LIST_PAGE_SIZE)}
          className="w-full text-sm text-primary font-medium py-2.5 hover:underline"
        >
          Cargar más invitados ({guests.length - visibleCount} restantes)
        </button>
      )}
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
    </div>
  )
})

function EditGuestRow({
  eventId,
  guest,
  onDone,
}: {
  eventId: string
  guest: GuestData
  onDone: () => void
}) {
  const [name, setName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.lastName || '')
  const [phone, setPhone] = useState(guest.phone || '')
  const [companions, setCompanions] = useState<CompanionData[]>(guest.companions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !lastName.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateGuest(eventId, guest.id, {
        name: name.trim(),
        lastName: lastName.trim(),
        phone: phone.trim(),
        companions,
      })
      onDone()
    } catch (err) {
      console.error('Error updating guest:', err)
      setError('No se pudo guardar el invitado. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="py-2.5 space-y-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nombre"
        />
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Apellido"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border border-gray-300 rounded-md px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Teléfono"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-primary text-white rounded-md px-2 py-2.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            Guardar
          </button>
          <button
            type="button"
            onClick={onDone}
            className="flex-1 border border-gray-300 rounded-md px-2 py-2.5 text-sm font-medium hover:bg-gray-50"
          >
            Cancelar
          </button>
        </div>
      </div>
      <CompanionFieldsEditor companions={companions} onChange={setCompanions} />
    </form>
  )
}
