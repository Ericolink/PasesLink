import { useState } from 'react'
import { partySize, updateGuest } from '../../firebase/guests'
import type { CompanionData, CustomField, GuestData } from '../../types'
import { CompanionFieldsEditor } from '../CompanionFields'
import { CustomFieldsEditRow } from '../CustomFieldsEditor'
import { GUEST_GROUP_MAX_MEMBERS } from '../../utils/validation'

export function EditGuestRow({
  eventId,
  guest,
  customFields = [],
  onDone,
}: {
  eventId: string
  guest: GuestData
  customFields?: CustomField[]
  onDone: () => void
}) {
  const [name, setName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.lastName || '')
  const [phone, setPhone] = useState(guest.phone || '')
  const [companions, setCompanions] = useState<CompanionData[]>(guest.companions)
  const [customValues, setCustomValues] = useState<Record<string, string>>(guest.customData || {})
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
        customData: customValues,
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
    <form onSubmit={handleSave} className="space-y-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nombre"
        />
        <input
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Apellido"
        />
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Teléfono"
        />
        <CompanionFieldsEditor companions={companions} onChange={setCompanions} />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
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
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  )
}

// Edición de una familia/grupo (guest.isGroup): a diferencia de EditGuestRow,
// no expone apellido/teléfono ni el editor de acompañantes uno por uno —
// solo nombre del grupo y cantidad de integrantes, igual que en el alta
// (GuestAddForm). Cambiar la cantidad recorta o extiende `companions` con
// entradas vacías; los datos de acompañantes ya cargados individualmente
// (si los hubiera) se preservan mientras entren en el nuevo tamaño.
export function EditGroupRow({
  eventId,
  guest,
  customFields = [],
  onDone,
}: {
  eventId: string
  guest: GuestData
  customFields?: CustomField[]
  onDone: () => void
}) {
  const [name, setName] = useState(guest.name)
  const [memberCount, setMemberCount] = useState(partySize(guest))
  const [customValues, setCustomValues] = useState<Record<string, string>>(guest.customData || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || memberCount < 1) return
    setSaving(true)
    setError('')
    try {
      const targetCompanionCount = Math.max(0, memberCount - 1)
      const companions = Array.from(
        { length: targetCompanionCount },
        (_, i) => guest.companions[i] || {},
      )
      await updateGuest(eventId, guest.id, { name: name.trim(), companions, customData: customValues })
      onDone()
    } catch (err) {
      console.error('Error updating group:', err)
      setError('No se pudo guardar el grupo. Intenta de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-2">
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="grid grid-cols-1 gap-2">
        <input
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Nombre del grupo"
        />
        <input
          type="number"
          required
          min={1}
          max={GUEST_GROUP_MAX_MEMBERS}
          value={memberCount}
          onChange={(e) => setMemberCount(Math.max(1, Math.min(GUEST_GROUP_MAX_MEMBERS, Number(e.target.value) || 1)))}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Integrantes"
        />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
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
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
        </div>
      </div>
    </form>
  )
}

export function GuestEditForm({
  eventId,
  guest,
  customFields = [],
  onDone,
}: {
  eventId: string
  guest: GuestData
  customFields?: CustomField[]
  onDone: () => void
}) {
  return guest.isGroup ? (
    <EditGroupRow eventId={eventId} guest={guest} customFields={customFields} onDone={onDone} />
  ) : (
    <EditGuestRow eventId={eventId} guest={guest} customFields={customFields} onDone={onDone} />
  )
}
