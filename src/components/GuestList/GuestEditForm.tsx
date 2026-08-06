import { useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { GuestVersionConflictError, partySize, updateGuest } from '../../firebase/guests'
import { trackGuestEdit } from '../../lib/analytics'
import type { CompanionData, CustomField, GuestData } from '../../types'
import { CompanionFieldsEditor } from '../CompanionFields'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from '../CountryCodeSelect'
import { CustomFieldsEditRow } from '../CustomFieldsEditor'
import { GUEST_GROUP_MAX_MEMBERS } from '../../utils/validation'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { useFocusFirstInvalidField } from '../../hooks/useFocusFirstInvalidField'
import { useIntegerFieldInput } from '../../hooks/useIntegerFieldInput'
import { FieldError, InputField } from '../accessibility/AccessibleField'

const EDIT_ROW_INPUT_CLASS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'

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
  const [errorAttempt, setErrorAttempt] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, errorAttempt)

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
      }, maxCompanions, guest.version ?? 0)
      trackGuestEdit(eventId)
      onDone()
    } catch (err) {
      console.error('Error updating guest:', err)
      setError(
        err instanceof GuestVersionConflictError
          ? err.message
          : 'No se pudo guardar el invitado. Intenta de nuevo.',
      )
      setErrorAttempt((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSave} className="space-y-2">
      <FieldError message={error} />
      <div className="grid grid-cols-1 gap-2">
        <InputField
          label="Nombre"
          labelClassName="sr-only"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Nombre"
        />
        <InputField
          label="Apellido"
          labelClassName="sr-only"
          type="text"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Apellido"
        />
        <div className="flex items-center gap-1.5">
          <CountryCodeSelect
            value={phoneCountry}
            onChange={setPhoneCountry}
            aria-label="País del teléfono"
            className="border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <InputField
            label="Teléfono"
            labelClassName="sr-only"
            containerClassName="flex-1 min-w-0"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={EDIT_ROW_INPUT_CLASS}
            placeholder="Teléfono"
          />
        </div>
        <CompanionFieldsEditor companions={companions} onChange={setCompanions} maxCompanions={maxCompanions} />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
        <div className="flex gap-2">
          <AccessibleButton type="submit" size="sm" disabled={saving} className="flex-1">
            Guardar
          </AccessibleButton>
          <AccessibleButton type="button" variant="secondary" size="sm" onClick={onDone} className="flex-1">
            Cancelar
          </AccessibleButton>
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
  const memberCount = useIntegerFieldInput(partySize(guest), 1, GUEST_GROUP_MAX_MEMBERS)
  const [customValues, setCustomValues] = useState<Record<string, string>>(guest.customData || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, errorAttempt)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const count = memberCount.value
    if (!name.trim() || count === null) return
    setSaving(true)
    setError('')
    try {
      const targetCompanionCount = Math.max(0, count - 1)
      const companions = Array.from(
        { length: targetCompanionCount },
        (_, i) => guest.companions[i] || {},
      )
      // maxCompanions no aplica a un grupo (isGroup: true) — updateGuest lo
      // bypassea leyendo isGroup del documento existente, así que el valor
      // que se pasa acá es irrelevante; GUEST_GROUP_MAX_MEMBERS ya limita
      // memberCount arriba.
      await updateGuest(eventId, guest.id, { name: name.trim(), companions, customData: customValues }, 0, guest.version ?? 0)
      onDone()
    } catch (err) {
      console.error('Error updating group:', err)
      setError(
        err instanceof GuestVersionConflictError
          ? err.message
          : 'No se pudo guardar el grupo. Intenta de nuevo.',
      )
      setErrorAttempt((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSave} className="space-y-2">
      <FieldError message={error} />
      <div className="grid grid-cols-1 gap-2">
        <InputField
          label="Nombre del grupo"
          labelClassName="sr-only"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Nombre del grupo"
        />
        <InputField
          label="Cantidad de integrantes"
          labelClassName="sr-only"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          value={memberCount.text}
          onChange={memberCount.onChange}
          onBlur={memberCount.onBlur}
          onFocus={memberCount.onFocus}
          onClick={memberCount.onClick}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Integrantes"
        />
        <CustomFieldsEditRow customFields={customFields} values={customValues} onChange={setCustomValues} />
        <div className="flex gap-2">
          <AccessibleButton type="submit" size="sm" disabled={saving} className="flex-1">
            Guardar
          </AccessibleButton>
          <AccessibleButton type="button" variant="secondary" size="sm" onClick={onDone} className="flex-1">
            Cancelar
          </AccessibleButton>
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
