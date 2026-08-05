import { useMemo, useRef, useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import { addGuest, addGuestsBulk, addGuestsFromRows, type ImportedGuestRow } from '../firebase/guests'
import { parseGuestsCsv } from '../utils/csvImport'
import { CompanionFieldsEditor } from './CompanionFields'
import { ConfirmDialog } from './ConfirmDialog'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from './CountryCodeSelect'
import { Tab, TabList, TabPanel, Tabs } from './accessibility/AccessibleTabs'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { AccessibleField, FieldError, InputField } from './accessibility/AccessibleField'
import { GUEST_CUSTOM_FIELD_VALUE_MAX, GUEST_FULL_NAME_MAX, GUEST_GROUP_MAX_MEMBERS, GUEST_NAME_PART_MAX, GUEST_PHONE_MAX } from '../utils/validation'
import { CustomFieldInput } from './CustomFieldInput'
import { captureException } from '../lib/sentry'
import { useFocusFirstInvalidField } from '../hooks/useFocusFirstInvalidField'
import { useIntegerFieldInput } from '../hooks/useIntegerFieldInput'
import { useAnnouncer } from './accessibility/LiveRegion'
import type { CompanionData, CustomField, GuestData } from '../types'

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseBulkNames(raw: string): string[] {
  return raw
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)
}

type PendingDuplicate =
  | { type: 'single' }
  | { type: 'group' }
  | { type: 'bulk'; duplicates: string[] }
  | { type: 'csv'; duplicates: string[] }

export function GuestAddForm({
  eventId,
  guests,
  customFields = [],
  maxCompanions,
}: {
  eventId: string
  guests: GuestData[]
  customFields?: CustomField[]
  maxCompanions: number
}) {
  const [mode, setMode] = useState<'single' | 'group' | 'bulk' | 'csv'>('single')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [phoneCountry, setPhoneCountry] = useState<CountryCode>(DEFAULT_PHONE_COUNTRY)
  const [companions, setCompanions] = useState<CompanionData[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [groupCustomValues, setGroupCustomValues] = useState<Record<string, string>>({})
  const [groupName, setGroupName] = useState('')
  // Sin valor inicial: si arrancara en un número (ej. 2), el organizador
  // podía enviar el formulario sin haber elegido realmente cuántos
  // integrantes tiene la familia. clampOnBlur:false porque acá el campo
  // debe poder quedar vacío hasta que el organizador escriba un número —
  // no autocompletarlo con el mínimo al salir del campo.
  const memberCount = useIntegerFieldInput(null, 1, GUEST_GROUP_MAX_MEMBERS, { clampOnBlur: false })
  const [bulkNames, setBulkNames] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [csvRows, setCsvRows] = useState<ImportedGuestRow[]>([])
  const [csvRowErrors, setCsvRowErrors] = useState<string[]>([])
  const [csvHeaderError, setCsvHeaderError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalidField(containerRef, errorAttempt)
  const { announce } = useAnnouncer()

  // Nombre completo normalizado de cada invitado ya cargado — usado para
  // avisar antes de crear un duplicado (mismo invitado agregado 2 veces),
  // tanto al agregar uno por uno como al pegar una lista.
  const existingNames = useMemo(
    () => new Set(guests.map((g) => normalizeName(`${g.name} ${g.lastName || ''}`))),
    [guests],
  )

  function findBulkDuplicates(names: string[]): string[] {
    const seen = new Set<string>()
    const duplicates = new Set<string>()
    for (const n of names) {
      const norm = normalizeName(n)
      if (existingNames.has(norm) || seen.has(norm)) duplicates.add(n)
      seen.add(norm)
    }
    return Array.from(duplicates)
  }

  async function submitSingleGuest() {
    setLoading(true)
    setError('')
    try {
      await addGuest(eventId, { name: name.trim(), lastName: lastName.trim(), phone: phone.trim(), phoneCountry, companions, customData: customValues }, maxCompanions)
      announce(`Invitado agregado: ${name.trim()} ${lastName.trim()}`)
      setName('')
      setLastName('')
      setPhone('')
      setPhoneCountry(DEFAULT_PHONE_COUNTRY)
      setCompanions([])
      setCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_single' } })
      setError(err instanceof Error ? err.message : 'No se pudo agregar el invitado. Intenta de nuevo.')
      setErrorAttempt((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  async function handleSingleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !lastName.trim()) return
    if (existingNames.has(normalizeName(`${name} ${lastName}`))) {
      setPendingDuplicate({ type: 'single' })
      return
    }
    await submitSingleGuest()
  }

  // Una familia/grupo es un GuestData común con `isGroup: true`: el nombre del
  // grupo va en `name`, y la cantidad de integrantes se traduce a
  // `companions` (integrantes - 1, sin nombre individual) para reusar
  // exactamente el mismo pase/QR/check-in/estadísticas que ya usa
  // partySize() — no existe un modelo ni una colección paralela.
  async function submitGroupGuest() {
    const count = memberCount.value
    if (count === null) return
    setLoading(true)
    setError('')
    try {
      const trimmedGroupName = groupName.trim()
      await addGuest(eventId, {
        name: trimmedGroupName,
        companions: Array.from({ length: Math.max(0, count - 1) }, () => ({})),
        isGroup: true,
        customData: groupCustomValues,
      }, maxCompanions)
      announce(`Familia o grupo agregado: ${trimmedGroupName}`)
      setGroupName('')
      memberCount.reset(null)
      setGroupCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_group' } })
      setError(err instanceof Error ? err.message : 'No se pudo agregar la familia o grupo. Intenta de nuevo.')
      setErrorAttempt((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  async function handleGroupSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!groupName.trim() || memberCount.value === null) return
    if (existingNames.has(normalizeName(groupName))) {
      setPendingDuplicate({ type: 'group' })
      return
    }
    await submitGroupGuest()
  }

  async function submitBulkGuests(names: string[]) {
    setLoading(true)
    setError('')
    try {
      const { added, skippedNames } = await addGuestsBulk(eventId, names)
      // Cupo lleno a mitad de la lista ("llenar lo que entra + reportar", ver
      // CAPACITY_LIMIT_ARCHITECTURE.md §8): no es un error, es un resultado
      // parcial esperado — se informa en el mismo lugar que un error, pero
      // sin loguearlo a Sentry (no es un bug, es el comportamiento diseñado).
      if (skippedNames.length > 0) {
        setError(
          `Se agregaron ${added} de ${names.length} invitados. El evento alcanzó su capacidad máxima. ` +
          `No se pudieron agregar: ${skippedNames.join(', ')}.`,
        )
        setErrorAttempt((n) => n + 1)
      }
      announce(`${added} invitado${added === 1 ? '' : 's'} agregado${added === 1 ? '' : 's'}`)
      setBulkNames('')
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_bulk' } })
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error agregando la lista. Es posible que parte de los invitados ya se hayan guardado — revisa la lista de invitados antes de reintentar.',
      )
      setErrorAttempt((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault()
    const names = parseBulkNames(bulkNames)
    if (names.length === 0) return
    const duplicates = findBulkDuplicates(names)
    if (duplicates.length > 0) {
      setPendingDuplicate({ type: 'bulk', duplicates })
      return
    }
    await submitBulkGuests(names)
  }

  async function handleCsvFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permite volver a elegir el mismo archivo si el usuario lo corrige y reintenta
    if (!file) return
    setError('')
    setCsvFileName(file.name)
    const text = await file.text()
    const result = parseGuestsCsv(text)
    setCsvHeaderError(result.headerError)
    setCsvRows(result.headerError ? [] : result.rows)
    setCsvRowErrors(result.rowErrors.map((e) => `Fila ${e.line}: ${e.message}`))
  }

  async function submitCsvGuests(rows: ImportedGuestRow[]) {
    setLoading(true)
    setError('')
    try {
      const { added, skippedNames } = await addGuestsFromRows(eventId, rows)
      // Mismo criterio que submitBulkGuests: resultado parcial esperado, no
      // un error — ver CAPACITY_LIMIT_ARCHITECTURE.md §8.
      if (skippedNames.length > 0) {
        setError(
          `Se importaron ${added} de ${rows.length} invitados. El evento alcanzó su capacidad máxima. ` +
          `No se pudieron importar: ${skippedNames.join(', ')}.`,
        )
        setErrorAttempt((n) => n + 1)
      }
      announce(`${added} invitado${added === 1 ? '' : 's'} importado${added === 1 ? '' : 's'}`)
      setCsvFileName('')
      setCsvRows([])
      setCsvRowErrors([])
      setCsvHeaderError(null)
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_csv' } })
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error importando el archivo. Es posible que parte de los invitados ya se hayan guardado — revisa la lista de invitados antes de reintentar.',
      )
      setErrorAttempt((n) => n + 1)
    } finally {
      setLoading(false)
    }
  }

  function handleCsvImport() {
    if (csvRows.length === 0) return
    const duplicates = findBulkDuplicates(csvRows.map((r) => `${r.name} ${r.lastName || ''}`))
    if (duplicates.length > 0) {
      setPendingDuplicate({ type: 'csv', duplicates })
      return
    }
    void submitCsvGuests(csvRows)
  }

  function handleConfirmDuplicate() {
    const pending = pendingDuplicate
    setPendingDuplicate(null)
    if (!pending) return
    if (pending.type === 'single') void submitSingleGuest()
    else if (pending.type === 'group') void submitGroupGuest()
    else if (pending.type === 'bulk') void submitBulkGuests(parseBulkNames(bulkNames))
    else void submitCsvGuests(csvRows)
  }

  return (
    <div ref={containerRef} className="border border-gray-200 rounded-lg p-4 bg-white">
      <Tabs value={mode} onChange={setMode}>
        <TabList aria-label="Formas de agregar invitados" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          <Tab value="single" label="Agregar uno" />
          <Tab value="group" label="Familia o grupo" />
          <Tab value="bulk" label="Agregar lista" />
          <Tab value="csv" label="Importar CSV" />
        </TabList>

        <div className="mb-3"><FieldError message={error} /></div>

        <TabPanel value="single">
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InputField
              label="Nombre"
              labelClassName="sr-only"
              type="text"
              required
              maxLength={GUEST_NAME_PART_MAX}
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <InputField
              label="Apellido"
              labelClassName="sr-only"
              type="text"
              required
              maxLength={GUEST_NAME_PART_MAX}
              placeholder="Apellido"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="flex items-center gap-1">
              <CountryCodeSelect value={phoneCountry} onChange={setPhoneCountry} aria-label="País del teléfono" className="border border-gray-300 rounded-md px-1.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white" />
              <InputField
                label="Teléfono (opcional)"
                labelClassName="sr-only"
                containerClassName="flex-1 min-w-0"
                type="tel"
                maxLength={GUEST_PHONE_MAX}
                placeholder="Teléfono (opcional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <CompanionFieldsEditor companions={companions} onChange={setCompanions} maxCompanions={maxCompanions} />

          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {customFields.map((field) => (
                <AccessibleField key={field.id} label={field.label} required={field.required} labelClassName="sr-only">
                  {(fieldProps) => (
                    <CustomFieldInput
                      field={field}
                      fieldProps={fieldProps}
                      placeholder={field.label}
                      maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                      value={customValues[field.id] || ''}
                      onChange={(v) => setCustomValues((cv) => ({ ...cv, [field.id]: v }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  )}
                </AccessibleField>
              ))}
            </div>
          )}

          <AccessibleButton type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? 'Agregando…' : 'Agregar invitado'}
          </AccessibleButton>
        </form>
        </TabPanel>

        <TabPanel value="group">
        <form onSubmit={handleGroupSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <InputField
              label="Nombre de la familia"
              containerClassName="sm:col-span-2"
              type="text"
              required
              maxLength={GUEST_FULL_NAME_MAX}
              placeholder="Ej. Familia Muñoz"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <InputField
              label="Número de pases"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              required
              placeholder="Ej. 4"
              value={memberCount.text}
              onChange={memberCount.onChange}
              onBlur={memberCount.onBlur}
              onFocus={memberCount.onFocus}
              onClick={memberCount.onClick}
              className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {memberCount.value !== null && (
            <p className="text-xs text-gray-500">
              Se genera un solo pase con un único código QR para todo el grupo — al escanearlo en la entrada, se suman
              los {memberCount.value} integrantes de una vez.
            </p>
          )}

          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {customFields.map((field) => (
                <AccessibleField key={field.id} label={field.label} required={field.required} labelClassName="sr-only">
                  {(fieldProps) => (
                    <CustomFieldInput
                      field={field}
                      fieldProps={fieldProps}
                      placeholder={field.label}
                      maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                      value={groupCustomValues[field.id] || ''}
                      onChange={(v) => setGroupCustomValues((cv) => ({ ...cv, [field.id]: v }))}
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  )}
                </AccessibleField>
              ))}
            </div>
          )}

          <AccessibleButton type="submit" size="sm" disabled={loading || memberCount.value === null} className="w-full">
            {loading ? 'Agregando…' : 'Agregar familia o grupo'}
          </AccessibleButton>
        </form>
        </TabPanel>

        <TabPanel value="bulk">
        <form onSubmit={handleBulkSubmit} className="space-y-3">
          <label htmlFor="guest-bulk-names" className="sr-only">Lista de nombres, uno por línea</label>
          <textarea
            id="guest-bulk-names"
            placeholder={'Un nombre por línea\nEj.\nJuan Pérez\nMaría López'}
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <AccessibleButton type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? 'Agregando…' : 'Agregar lista de invitados'}
          </AccessibleButton>
        </form>
        </TabPanel>

        <TabPanel value="csv">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Un archivo .csv con columnas Nombre, Apellido, Teléfono y Email (Apellido/Teléfono/Email son opcionales).
            La primera fila debe tener los encabezados.
          </p>
          <label className="flex items-center justify-center border-2 border-dashed border-gray-300 rounded-md px-3 py-6 text-sm text-gray-500 cursor-pointer hover:border-primary hover:text-primary transition-colors">
            {csvFileName || 'Elegir archivo .csv'}
            <input type="file" accept=".csv,text/csv" onChange={(e) => void handleCsvFileSelected(e)} className="hidden" />
          </label>

          <FieldError message={csvHeaderError} />

          {csvRows.length > 0 && (
            <div className="border border-gray-200 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">
                {csvRows.length} invitado{csvRows.length === 1 ? '' : 's'} listo{csvRows.length === 1 ? '' : 's'} para importar
              </p>
              <ul className="text-xs text-gray-500 space-y-0.5 max-h-32 overflow-y-auto">
                {csvRows.slice(0, 8).map((row, i) => (
                  <li key={i}>
                    {row.name} {row.lastName || ''}
                    {row.phone ? ` · ${row.phone}` : ''}
                    {row.email ? ` · ${row.email}` : ''}
                  </li>
                ))}
                {csvRows.length > 8 && <li>… y {csvRows.length - 8} más</li>}
              </ul>
            </div>
          )}

          {csvRowErrors.length > 0 && (
            <div className="text-xs text-amber-600 bg-amber-50 rounded-md px-3 py-2 space-y-0.5">
              {csvRowErrors.slice(0, 5).map((msg, i) => <p key={i}>{msg}</p>)}
              {csvRowErrors.length > 5 && <p>… y {csvRowErrors.length - 5} más</p>}
            </div>
          )}

          <AccessibleButton type="button" size="sm" onClick={handleCsvImport} disabled={loading || csvRows.length === 0} className="w-full">
            {loading ? 'Importando…' : `Importar ${csvRows.length || ''} invitado${csvRows.length === 1 ? '' : 's'}`}
          </AccessibleButton>
        </div>
        </TabPanel>
      </Tabs>

      <ConfirmDialog
        open={pendingDuplicate !== null}
        title="Posible invitado duplicado"
        message={
          pendingDuplicate?.type === 'single'
            ? `${name.trim()} ${lastName.trim()} ya está en la lista de invitados. ¿Agregar de todas formas?`
            : pendingDuplicate?.type === 'group'
              ? `${groupName.trim()} ya está en la lista de invitados. ¿Agregar de todas formas?`
              : pendingDuplicate?.type === 'bulk'
                ? `${pendingDuplicate.duplicates.length} de los nombres pegados ya están en la lista o se repiten: ${pendingDuplicate.duplicates.join(', ')}. ¿Agregar todos de todas formas?`
                : pendingDuplicate?.type === 'csv'
                  ? `${pendingDuplicate.duplicates.length} de los nombres del archivo ya están en la lista o se repiten: ${pendingDuplicate.duplicates.join(', ')}. ¿Importar todos de todas formas?`
                  : ''
        }
        confirmLabel="Agregar de todas formas"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmDuplicate}
        onCancel={() => setPendingDuplicate(null)}
      />
    </div>
  )
}
