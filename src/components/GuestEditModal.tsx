import { useEffect, useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { getGuestContact, resolveMaxCompanions, updateGuestSelf } from '../firebase/guests'
import type { CompanionData, EventData, GuestData, MenuSelection } from '../types'
import { CompanionFieldsEditor } from './CompanionFields'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from './CountryCodeSelect'
import { CustomFieldsEditRow } from './CustomFieldsEditor'
import { MenuSelectionInput } from './MenuSelectionInput'
import { labelClass, inputClass } from '../pages/EventJoin'
import { AccessibleModal } from './accessibility/AccessibleModal'
import { useFocusFirstInvalidField } from '../hooks/useFocusFirstInvalidField'
import { FieldError, AccessibleField } from './accessibility/AccessibleField'

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
  onSaved: (patch: Pick<GuestData, 'name' | 'lastName' | 'companions' | 'customData' | 'menuSelection'>) => void
}) {
  const [loadingContact, setLoadingContact] = useState(true)
  const [name, setName] = useState(guest.name)
  const [lastName, setLastName] = useState(guest.lastName || '')
  const [phone, setPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY)
  const [email, setEmail] = useState('')
  const [companions, setCompanions] = useState<CompanionData[]>(guest.companions)
  const [customValues, setCustomValues] = useState<Record<string, string>>(guest.customData || {})
  const [menuSelection, setMenuSelection] = useState<MenuSelection | undefined>(guest.menuSelection)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const [saved, setSaved] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  useFocusFirstInvalidField(formRef, errorAttempt)

  useEffect(() => {
    let cancelled = false
    getGuestContact(eventId, guest.id)
      .then((contact) => {
        if (cancelled) return
        setPhone(contact.phone)
        if (contact.phoneCountry) setPhoneCountry(contact.phoneCountry as CountryCode)
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
        { name, lastName, phone, phoneCountry, email, companions, customData: customValues, menuSelection },
        event.customFields || [],
      )
      const trimmedName = name.trim()
      const trimmedLastName = lastName.trim()
      onSaved({ name: trimmedName, lastName: trimmedLastName, companions, customData: customValues, menuSelection })
      setSaved(true)
    } catch (err) {
      console.error('Error al guardar la edición del invitado:', err)
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Recargá la página e intentá de nuevo.')
      setErrorAttempt((n) => n + 1)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AccessibleModal
      open
      onClose={onClose}
      label="Editar mis datos"
      surfaceClassName="bg-[var(--invite-surface)]"
      className="p-6 text-left overflow-y-auto"
    >
        {saved ? (
          <>
            <h2 id="guest-edit-title" className="text-base font-semibold mb-2 text-[var(--invite-text)]">¡Listo!</h2>
            <p className="text-sm text-[var(--invite-text-muted)] mb-5">Tu información se actualizó correctamente.</p>
            <button
              onClick={onClose}
              className="w-full text-white rounded-md px-4 py-3 text-sm font-medium hover:opacity-90 transition-opacity bg-[var(--invite-accent)]"
            >
              Cerrar
            </button>
          </>
        ) : (
          <form ref={formRef} onSubmit={handleSave} className="space-y-3">
            <h2 id="guest-edit-title" className="text-base font-semibold mb-1 text-[var(--invite-text)]">Editar mis datos</h2>
            {loadingContact ? (
              <p className="text-sm text-[var(--invite-text-muted)]">Cargando…</p>
            ) : (
              <>
                <AccessibleField label="Nombre" required labelClassName={labelClass}>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="text"
                      maxLength={60}
                      autoComplete="given-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className={inputClass}
                    />
                  )}
                </AccessibleField>
                <AccessibleField label="Apellido" labelClassName={labelClass}>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="text"
                      maxLength={60}
                      autoComplete="family-name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className={inputClass}
                    />
                  )}
                </AccessibleField>
                <AccessibleField label="Teléfono" labelClassName={labelClass}>
                  {(fieldProps) => (
                    <div className="flex items-center gap-1.5">
                      <CountryCodeSelect
                        value={phoneCountry}
                        onChange={setPhoneCountry}
                        aria-label="País del teléfono"
                        className="rounded-full border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-text)] px-2.5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--invite-accent)]"
                      />
                      <input
                        {...fieldProps}
                        type="tel"
                        maxLength={30}
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className={`flex-1 min-w-0 ${inputClass}`}
                      />
                    </div>
                  )}
                </AccessibleField>
                <AccessibleField label="Email" labelClassName={labelClass}>
                  {(fieldProps) => (
                    <input
                      {...fieldProps}
                      type="email"
                      maxLength={120}
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className={inputClass}
                    />
                  )}
                </AccessibleField>
                {event.customFields && event.customFields.length > 0 && (
                  // <fieldset>/<legend> en vez de un <label> suelto: agrupa
                  // varios campos (no un control único), así que un <label>
                  // sin htmlFor era HTML inválido y no se anunciaba como
                  // grupo a lectores de pantalla.
                  <fieldset className="space-y-2 border-0 p-0 m-0">
                    <legend className={labelClass}>Datos del evento</legend>
                    <CustomFieldsEditRow
                      customFields={event.customFields}
                      values={customValues}
                      onChange={setCustomValues}
                      inputClassName={inputClass}
                    />
                  </fieldset>
                )}
                {companions.length > 0 && (
                  <fieldset className="border-0 p-0 m-0">
                    <legend className={labelClass}>Acompañantes</legend>
                    <CompanionFieldsEditor
                      companions={companions}
                      onChange={setCompanions}
                      allowAddRemove={false}
                      maxCompanions={resolveMaxCompanions(event)}
                    />
                  </fieldset>
                )}
                {event.menu && (event.menu.options.length > 0 || event.menu.restrictions.length > 0) && (
                  <fieldset className="border-0 p-0 m-0 space-y-3">
                    <legend className={labelClass}>Menú</legend>
                    <MenuSelectionInput
                      menu={event.menu}
                      value={menuSelection}
                      onChange={setMenuSelection}
                      personLabel={companions.length > 0 ? `Tu menú (${name || 'invitado principal'})` : undefined}
                    />
                    {companions.map((companion, i) => (
                      <MenuSelectionInput
                        key={i}
                        menu={event.menu!}
                        value={companion.menuSelection}
                        onChange={(v) => setCompanions((prev) => prev.map((c, idx) => (idx === i ? { ...c, menuSelection: v } : c)))}
                        personLabel={`Menú de ${companion.name || `acompañante ${i + 1}`}`}
                      />
                    ))}
                  </fieldset>
                )}
              </>
            )}
            <FieldError message={error} />
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
    </AccessibleModal>
  )
}
