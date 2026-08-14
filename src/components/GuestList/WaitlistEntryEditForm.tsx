import { useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { updateWaitlistEntry } from '../../firebase/waitlist'
import type { CustomField, WaitlistEntryData } from '../../types'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from '../CountryCodeSelect'
import { CustomFieldsEditRow } from '../CustomFieldsEditor'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { useFocusFirstInvalidField } from '../../hooks/useFocusFirstInvalidField'
import { useIntegerFieldInput } from '../../hooks/useIntegerFieldInput'
import { Checkbox, FieldError, InputField } from '../accessibility/AccessibleField'
import { EDIT_ROW_INPUT_CLASS } from './GuestEditForm'

// "Modificar pase" de una entrada de la Waitlist — calcado de EditGuestRow
// (GuestEditForm.tsx), pero sobre WaitlistEntryData: sin apellido separado
// (acá `name` es un solo campo, ver el formulario de alta en
// EventJoin.tsx/WaitlistEntryData) y sin companions[] individuales (solo el
// tamaño del grupo, `partySize`, igual que EditGroupRow). Escritura directa
// (updateWaitlistEntry), no Cloud Function — ver firestore.rules
// (isValidWaitlistEntryEdit).
export function WaitlistEntryEditForm({
  eventId,
  entry,
  customFields = [],
  maxCompanions,
  onDone,
}: {
  eventId: string
  entry: WaitlistEntryData
  customFields?: CustomField[]
  maxCompanions: number
  onDone: () => void
}) {
  const [name, setName] = useState(entry.name)
  const [phone, setPhone] = useState(entry.phone || '')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>((entry.phoneCountry as CountryCode) || DEFAULT_PHONE_COUNTRY)
  const [email, setEmail] = useState(entry.email || '')
  const [whatsappConsent, setWhatsappConsent] = useState(entry.whatsappConsent === true)
  const partySizeField = useIntegerFieldInput(entry.partySize, 1, maxCompanions + 1)
  const [customValues, setCustomValues] = useState<Record<string, string>>(entry.customData || {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, errorAttempt)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    const partySize = partySizeField.value
    if (!name.trim() || partySize === null) return
    setSaving(true)
    setError('')
    try {
      await updateWaitlistEntry(eventId, entry.id, {
        name: name.trim(),
        partySize,
        phone: phone.trim(),
        phoneCountry,
        email: email.trim(),
        whatsappConsent,
        customData: customValues,
      })
      onDone()
    } catch (err) {
      console.error('Error updating waitlist entry:', err)
      setError('No se pudo guardar. Intenta de nuevo.')
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
          label="Cantidad de personas"
          labelClassName="sr-only"
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          required
          value={partySizeField.text}
          onChange={partySizeField.onChange}
          onBlur={partySizeField.onBlur}
          onFocus={partySizeField.onFocus}
          onClick={partySizeField.onClick}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Cantidad de personas"
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
            onChange={(e) => {
              const value = e.target.value
              setPhone(value)
              if (!value.trim()) setWhatsappConsent(false)
            }}
            className={EDIT_ROW_INPUT_CLASS}
            placeholder="Teléfono"
          />
        </div>
        <label
          htmlFor={`waitlist-whatsapp-consent-${entry.id}`}
          className={`flex items-start gap-2.5 text-sm text-gray-600 dark:text-gray-400 ${phone.trim() ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
        >
          <Checkbox
            id={`waitlist-whatsapp-consent-${entry.id}`}
            checked={whatsappConsent}
            disabled={!phone.trim()}
            onChange={(e) => setWhatsappConsent(e.target.checked)}
            className="mt-0.5 shrink-0"
          />
          <span>Acepta recibir notificaciones relacionadas con este evento por WhatsApp.</span>
        </label>
        <InputField
          label="Correo"
          labelClassName="sr-only"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={EDIT_ROW_INPUT_CLASS}
          placeholder="Correo"
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
