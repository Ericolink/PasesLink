import { useState } from 'react'
import { Link } from 'react-router-dom'
import { deleteGuest, updateGuest } from '../firebase/guests'
import type { GuestData } from '../types'
import { RSVP_LABELS } from '../types'

export function GuestList({ eventId, guests }: { eventId: string; guests: GuestData[] }) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  if (guests.length === 0) {
    return <p className="text-sm text-gray-500 py-6 text-center">Todavía no agregaste invitados.</p>
  }

  async function handleDelete(guest: GuestData) {
    if (!confirm(`¿Eliminar a ${guest.name}?`)) return
    await deleteGuest(eventId, guest.id, guest.status === 'checked_in')
  }

  async function handleCopy(guest: GuestData) {
    const url = `${window.location.origin}/pass/${eventId}/${guest.qrToken}`
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(guest.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // ignore
    }
  }

  return (
    <div className="divide-y divide-gray-100">
      {guests.map((guest) =>
        editingId === guest.id ? (
          <EditGuestRow key={guest.id} eventId={eventId} guest={guest} onDone={() => setEditingId(null)} />
        ) : (
          <div key={guest.id} className="flex items-center justify-between py-2.5 gap-2">
            <div className="min-w-0">
              <p className="font-medium text-gray-900 text-sm truncate">
                {guest.name}
                {guest.companions > 0 && (
                  <span className="text-gray-400 font-normal"> +{guest.companions}</span>
                )}
              </p>
              {guest.email && <p className="text-xs text-gray-500 truncate">{guest.email}</p>}
            </div>
            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
              {guest.rsvpStatus !== 'pending' && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    guest.rsvpStatus === 'yes' ? 'bg-blue-50 text-primary' : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {RSVP_LABELS[guest.rsvpStatus]}
                </span>
              )}
              {guest.status === 'checked_in' ? (
                guest.checkedOutAt ? (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                    Salió
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                    Confirmado
                  </span>
                )
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-500">
                  Invitado
                </span>
              )}
              <button onClick={() => handleCopy(guest)} className="text-xs text-primary font-medium">
                {copiedId === guest.id ? 'Copiado!' : 'Copiar link'}
              </button>
              <Link to={`/pass/${eventId}/${guest.qrToken}`} target="_blank" className="text-xs text-primary font-medium">
                Ver pase
              </Link>
              <button onClick={() => setEditingId(guest.id)} className="text-xs text-gray-500 font-medium">
                Editar
              </button>
              <button onClick={() => handleDelete(guest)} className="text-xs text-red-500 font-medium">
                Eliminar
              </button>
            </div>
          </div>
        ),
      )}
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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await updateGuest(eventId, guest.id, {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        companions,
      })
      onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
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
