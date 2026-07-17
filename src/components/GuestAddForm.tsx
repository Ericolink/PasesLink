import { useMemo, useState } from 'react'
import { addGuest, addGuestsBulk, addGuestsFromRows, type ImportedGuestRow } from '../firebase/guests'
import { parseGuestsCsv } from '../utils/csvImport'
import { CompanionFieldsEditor } from './CompanionFields'
import { ConfirmDialog } from './ConfirmDialog'
import { ScrollableTabs } from './ScrollableTabs'
import { TabButton } from './TabButton'
import { Button } from './Button'
import { FieldError } from './FieldError'
import { GUEST_CUSTOM_FIELD_VALUE_MAX, GUEST_FULL_NAME_MAX, GUEST_GROUP_MAX_MEMBERS, GUEST_NAME_PART_MAX, GUEST_PHONE_MAX } from '../utils/validation'
import { customFieldInputProps } from '../utils/customFieldInput'
import { captureException } from '../lib/sentry'
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
  const [companions, setCompanions] = useState<CompanionData[]>([])
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [groupCustomValues, setGroupCustomValues] = useState<Record<string, string>>({})
  const [groupName, setGroupName] = useState('')
  const [memberCount, setMemberCount] = useState(2)
  const [bulkNames, setBulkNames] = useState('')
  const [csvFileName, setCsvFileName] = useState('')
  const [csvRows, setCsvRows] = useState<ImportedGuestRow[]>([])
  const [csvRowErrors, setCsvRowErrors] = useState<string[]>([])
  const [csvHeaderError, setCsvHeaderError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)

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
      await addGuest(eventId, { name: name.trim(), lastName: lastName.trim(), phone: phone.trim(), companions, customData: customValues }, maxCompanions)
      setName('')
      setLastName('')
      setPhone('')
      setCompanions([])
      setCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_single' } })
      setError(err instanceof Error ? err.message : 'No se pudo agregar el invitado. Intenta de nuevo.')
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
    setLoading(true)
    setError('')
    try {
      const trimmedGroupName = groupName.trim()
      await addGuest(eventId, {
        name: trimmedGroupName,
        companions: Array.from({ length: Math.max(0, memberCount - 1) }, () => ({})),
        isGroup: true,
        customData: groupCustomValues,
      }, maxCompanions)
      setGroupName('')
      setMemberCount(2)
      setGroupCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_group' } })
      setError(err instanceof Error ? err.message : 'No se pudo agregar la familia o grupo. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleGroupSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!groupName.trim() || memberCount < 1) return
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
      await addGuestsBulk(eventId, names)
      setBulkNames('')
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_bulk' } })
      setError(
        err instanceof Error
          ? err.message
          : 'Ocurrió un error agregando la lista. Es posible que parte de los invitados ya se hayan guardado — revisa la lista de invitados antes de reintentar.',
      )
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
      await addGuestsFromRows(eventId, rows)
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
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <ScrollableTabs className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
        <TabButton label="Agregar uno" active={mode === 'single'} onClick={() => setMode('single')} />
        <TabButton label="Familia o grupo" active={mode === 'group'} onClick={() => setMode('group')} />
        <TabButton label="Agregar lista" active={mode === 'bulk'} onClick={() => setMode('bulk')} />
        <TabButton label="Importar CSV" active={mode === 'csv'} onClick={() => setMode('csv')} />
      </ScrollableTabs>

      <div className="mb-3"><FieldError message={error} /></div>

      {mode === 'single' ? (
        <form onSubmit={handleSingleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              maxLength={GUEST_NAME_PART_MAX}
              placeholder="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="text"
              required
              maxLength={GUEST_NAME_PART_MAX}
              placeholder="Apellido"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="tel"
              maxLength={GUEST_PHONE_MAX}
              placeholder="Teléfono (opcional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          <CompanionFieldsEditor companions={companions} onChange={setCompanions} maxCompanions={maxCompanions} />

          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {customFields.map((field) => (
                <input
                  key={field.id}
                  {...customFieldInputProps(field.type)}
                  placeholder={field.label}
                  maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                  value={customValues[field.id] || ''}
                  onChange={(e) => setCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ))}
            </div>
          )}

          <Button type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? 'Agregando…' : 'Agregar invitado'}
          </Button>
        </form>
      ) : mode === 'group' ? (
        <form onSubmit={handleGroupSubmit} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              maxLength={GUEST_FULL_NAME_MAX}
              placeholder="Nombre del grupo (ej. Familia Muñoz)"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="sm:col-span-2 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="number"
              required
              min={1}
              max={GUEST_GROUP_MAX_MEMBERS}
              placeholder="Cantidad de integrantes"
              value={memberCount}
              onChange={(e) => setMemberCount(Math.max(1, Math.min(GUEST_GROUP_MAX_MEMBERS, Number(e.target.value) || 1)))}
              onFocus={(e) => e.currentTarget.select()}
              onClick={(e) => e.currentTarget.select()}
              className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          <p className="text-xs text-gray-500">
            Se genera un solo pase con un único código QR para todo el grupo — al escanearlo en la entrada, se suman
            los {memberCount} integrantes de una vez.
          </p>

          {customFields.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {customFields.map((field) => (
                <input
                  key={field.id}
                  {...customFieldInputProps(field.type)}
                  placeholder={field.label}
                  maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
                  value={groupCustomValues[field.id] || ''}
                  onChange={(e) => setGroupCustomValues((v) => ({ ...v, [field.id]: e.target.value }))}
                  className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                />
              ))}
            </div>
          )}

          <Button type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? 'Agregando…' : 'Agregar familia o grupo'}
          </Button>
        </form>
      ) : mode === 'bulk' ? (
        <form onSubmit={handleBulkSubmit} className="space-y-3">
          <textarea
            placeholder={'Un nombre por línea\nEj.\nJuan Pérez\nMaría López'}
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <Button type="submit" size="sm" disabled={loading} className="w-full">
            {loading ? 'Agregando…' : 'Agregar lista de invitados'}
          </Button>
        </form>
      ) : (
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

          <Button type="button" size="sm" onClick={handleCsvImport} disabled={loading || csvRows.length === 0} className="w-full">
            {loading ? 'Importando…' : `Importar ${csvRows.length || ''} invitado${csvRows.length === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}

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
