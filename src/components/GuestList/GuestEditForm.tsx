import { useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { partySize, updateGuest } from '../../firebase/guests'
import type { CompanionData, CustomField, GuestData } from '../../types'
import { CompanionFieldsEditor } from '../CompanionFields'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from '../CountryCodeSelect'
import { CustomFieldsEditRow } from '../CustomFieldsEditor'
import { GUEST_GROUP_MAX_MEMBERS } from '../../utils/validation'
import { Button } from '../Button'
import { FieldError } from '../FieldError'

function EditGuestRow({
  eventId,
  guest,
  customFields = [],
  maxCompanions,
  onDone,
}: {
  eventId: string
  guest: GuestData
  customFields?: CustomField[]
  maxCompanions: number
  onDone: () => void
}) {
  const [name, setName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.lastName || '')
  const [phone, setPhone] = useState(guest.phone || '')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>((guest.phoneCountry as CountryCode) || DEFAULT_PHONE_COUNTRY)
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
        phoneCountry,
        companions,
        customData: customValues,
      }, maxCompanions)
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
      <FieldError message={error} />
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
        <div className="flex items-center gap-1.5">
          <CountryCodeSelect
            value={phoneCountry}
            onChange={setPhoneCountry}
            aria-label="País del teléfono"
            className="shrink-0 border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            placeholder="Teléfono"
          />
        </div>
        <CompanionFieldsEditor companions={companions} onChange={setCompanions} maxCompanions={maxCompanions} />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving} className="flex-1">
            Guardar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDone} className="flex-1">
            Cancelar
          </Button>
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
function EditGroupRow({
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
      // maxCompanions no aplica a un grupo (isGroup: true) — updateGuest lo
      // bypassea leyendo isGroup del documento existente, así que el valor
      // que se pasa acá es irrelevante; GUEST_GROUP_MAX_MEMBERS ya limita
      // memberCount arriba.
      await updateGuest(eventId, guest.id, { name: name.trim(), companions, customData: customValues }, 0)
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
      <FieldError message={error} />
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
          onFocus={(e) => e.currentTarget.select()}
          onClick={(e) => e.currentTarget.select()}
          className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Integrantes"
        />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={saving} className="flex-1">
            Guardar
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={onDone} className="flex-1">
            Cancelar
          </Button>
        </div>
      </div>
    </form>
  )
}

export function GuestEditForm({
  eventId,
  guest,
  customFields = [],
  maxCompanions,
  onDone,
}: {
  eventId: string
  guest: GuestData
  customFields?: CustomField[]
  maxCompanions: number
  onDone: () => void
}) {
  return guest.isGroup ? (
    <EditGroupRow eventId={eventId} guest={guest} customFields={customFields} onDone={onDone} />
  ) : (
    <EditGuestRow eventId={eventId} guest={guest} customFields={customFields} maxCompanions={maxCompanions} onDone={onDone} />
  )
}
