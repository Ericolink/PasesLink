import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteGuest, resetGuestRsvp, setGuestPaymentStatus, unlockGuestPass, updateGuest } from '../firebase/guests'
import type { GuestData } from '../types'
import { RSVP_LABELS } from '../types'
import { IconEdit, IconEye, IconInbox, IconRotateCcw, IconShare, IconTicket, IconTrash } from './Icons'
import { ConfirmDialog } from './ConfirmDialog'

export function GuestList({
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
  const [actionError, setActionError] = useState('')

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
    const url = `${window.location.origin}/pass/${eventId}/${guest.qrToken}`
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

  return (
    <div className="space-y-2">
      {actionError && (
        <p className="text-xs text-red-500 bg-red-50 border border-red-200 rounded-md px-3 py-2">{actionError}</p>
      )}
      {guests.map((guest) =>
        editingId === guest.id ? (
          <EditGuestRow key={guest.id} eventId={eventId} guest={guest} onDone={() => setEditingId(null)} />
        ) : (
          <div key={guest.id} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="p-3 flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 text-sm break-words">
                  {guest.name}
                  {guest.companions > 0 && (
                    <span className="text-gray-400 font-normal"> +{guest.companions}</span>
                  )}
                </p>
                {guest.email && <p className="text-xs text-gray-500 truncate">{guest.email}</p>}
              </div>
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${
                  guest.status === 'checked_in'
                    ? 'bg-blue-500'
                    : guest.rsvpStatus === 'yes'
                      ? 'bg-green-500'
                      : guest.rsvpStatus === 'no'
                        ? 'bg-red-500'
                        : 'bg-amber-400'
                }`}
                title={
                  guest.status === 'checked_in'
                    ? 'Escaneado'
                    : guest.rsvpStatus === 'yes' ? 'Asistirá' : guest.rsvpStatus === 'no' ? 'No asistirá' : 'Sin responder'
                }
              />
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
                    : `Pendiente · ${currency}${(ticketPrice * (1 + guest.companions)).toLocaleString('es')}`}
                </span>
                <button onClick={() => handleTogglePayment(guest)} className="text-xs text-primary font-medium">
                  {guest.paymentStatus === 'paid' ? 'Marcar como no pagado' : 'Marcar como pagado'}
                </button>
              </div>
            )}
            <div className="grid grid-cols-4 divide-x divide-gray-100 border-t border-gray-100">
              <button
                onClick={() => handleShare(guest)}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs text-primary font-medium hover:bg-gray-50 transition-colors"
              >
                <IconShare className="w-4 h-4" />
                {copiedId === guest.id ? 'Copiado!' : 'Compartir'}
              </button>
              <Link
                to={`/pass/${eventId}/${guest.qrToken}`}
                target="_blank"
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs text-primary font-medium hover:bg-gray-50 transition-colors"
              >
                <IconEye className="w-4 h-4" />
                Ver pase
              </Link>
              <button
                onClick={() => setEditingId(guest.id)}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs text-gray-500 font-medium hover:bg-gray-50 transition-colors"
              >
                <IconEdit className="w-4 h-4" />
                Editar
              </button>
              <button
                onClick={() => setDeletingGuest(guest)}
                className="flex flex-col items-center justify-center gap-1 py-2.5 text-xs text-red-500 font-medium hover:bg-red-50 transition-colors"
              >
                <IconTrash className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        ),
      )}
      <ConfirmDialog
        open={!!deletingGuest}
        title="Eliminar invitado"
        message={`¿Eliminar a ${deletingGuest?.name}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setDeletingGuest(null)}
      />
      <ConfirmDialog
        open={!!unlockingGuest}
        title="Desbloquear pase"
        message={`Esto permite que "${unlockingGuest?.name}" abra su pase desde un dispositivo distinto al que lo bloqueó (por ejemplo, si cambió de teléfono). No afecta su confirmación de asistencia ni su check-in.`}
        confirmLabel="Desbloquear"
        onConfirm={confirmUnlock}
        onCancel={() => setUnlockingGuest(null)}
      />
    </div>
  )
}

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
  const [email, setEmail] = useState(guest.email || '')
  const [phone, setPhone] = useState(guest.phone || '')
  const [companions, setCompanions] = useState(guest.companions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateGuest(eventId, guest.id, {
        name: name.trim(),
        email: email.trim(),
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
    <form onSubmit={handleSave} className="py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
      {error && <p className="col-span-2 sm:col-span-5 text-xs text-red-500">{error}</p>}
      <input
        type="text"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary sm:col-span-1"
        placeholder="Nombre"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Email"
      />
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Teléfono"
      />
      <input
        type="number"
        min={0}
        value={companions}
        onChange={(e) => setCompanions(Math.max(0, Number(e.target.value)))}
        className="border border-gray-300 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        placeholder="Acompañantes"
      />
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 bg-primary text-white rounded-md px-2 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onDone}
          className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm font-medium hover:bg-gray-50"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
