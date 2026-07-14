import { useEffect, useState } from 'react'
import { getGuestContact, resolveMaxCompanions, updateGuestSelf } from '../firebase/guests'
import type { CompanionData, EventData, GuestData } from '../types'
import { CompanionFieldsEditor } from './CompanionFields'
import { CustomFieldsEditRow } from './CustomFieldsEditor'
import { labelClass, inputClass } from '../pages/EventJoin'

export function GuestEditModal({
  eventId,
  event,
  guest,
  lockToken,
  onClose,
  onSaved,
}: {
  eventId: string
  event: EventData
  guest: GuestData
  lockToken: string | null
  onClose: () => void
  onSaved: (patch: Pick<GuestData, 'name' | 'lastName' | 'companions' | 'customData'>) => void
}) {
  const [loadingContact, setLoadingContact] = useState(true)
  const [name, setName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.lastName || '')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [companions, setCompanions] = useState<CompanionData[]>(guest.companions)
  const [customValues, setCustomValues] = useState<Record<string, string>>(guest.customData || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    getGuestContact(eventId, guest.id)
      .then((contact) => {
        if (cancelled) return
        setPhone(contact.phone)
        setEmail(contact.email)
      })
      .finally(() => {
        if (!cancelled) setLoadingContact(false)
      })
    return () => {
      cancelled = true
    }
  }, [eventId, guest.id])

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      await updateGuestSelf(
        eventId,
        guest.id,
        lockToken,
        { name, lastName, phone, email, companions, customData: customValues },
        event.customFields || [],
      )
      const trimmedName = name.trim()
      const trimmedLastName = lastName.trim()
      onSaved({ name: trimmedName, lastName: trimmedLastName, companions, customData: customValues })
      setSaved(true)
    } catch (err) {
      console.error('Error al guardar la edición del invitado:', err)
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Recargá la página e intentá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--invite-surface)] rounded-2xl shadow-2xl w-full max-w-sm p-6 text-left max-h-[90vh] overflow-y-auto">
        {saved ? (
          <>
            <h2 className="text-base font-semibold mb-2 text-[var(--invite-text)]">¡Listo!</h2>
            <p className="text-sm text-[var(--invite-text-muted)] mb-5">Tu información se actualizó correctamente.</p>
            <button
              onClick={onClose}
              className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
            >
              Cerrar
            </button>
          </>
        ) : (
          <form onSubmit={handleSave} className="space-y-3">
            <h2 className="text-base font-semibold mb-1 text-[var(--invite-text)]">Editar mis datos</h2>
            {loadingContact ? (
              <p className="text-sm text-[var(--invite-text-muted)]">Cargando…</p>
            ) : (
              <>
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    required
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Apellido</label>
                  <input
                    type="text"
                    maxLength={60}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Teléfono</label>
                  <input
                    type="tel"
                    maxLength={30}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    maxLength={120}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={inputClass}
                  />
                </div>
                {event.customFields && event.customFields.length > 0 && (
                  <div className="space-y-2">
                    <label className={labelClass}>Datos del evento</label>
                    <CustomFieldsEditRow
                      customFields={event.customFields}
                      values={customValues}
                      onChange={setCustomValues}
                      inputClassName={inputClass}
                    />
                  </div>
                )}
                {companions.length > 0 && (
                  <div>
                    <label className={labelClass}>Acompañantes</label>
                    <CompanionFieldsEditor
                      companions={companions}
                      onChange={setCompanions}
                      allowAddRemove={false}
                      maxCompanions={resolveMaxCompanions(event)}
                    />
                  </div>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="submit"
                disabled={saving || loadingContact}
                className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 bg-[var(--invite-accent)]"
              >
                {saving ? 'Guardando…' : 'Guardar cambios'}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="w-full border rounded-md px-4 py-3 text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-50"
                style={{ borderColor: 'var(--invite-border)' }}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
