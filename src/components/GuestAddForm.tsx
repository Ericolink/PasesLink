import { useEffect, useMemo, useRef, useState } from 'react'
import { addGuest, addGuestsBulk, type ImportedGuestRow } from '../firebase/guests'
import { cancelCsvImportJob, startCsvImportJob, subscribeToCsvImportJob, type CsvImportJob } from '../firebase/csvImportJobs'
import { parseGuestsCsv } from '../utils/csvImport'
import { CompanionFieldsEditor } from './CompanionFields'
import { ConfirmDialog } from './ConfirmDialog'
import { Tab, TabList, TabPanel, Tabs } from './accessibility/AccessibleTabs'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { AccessibleField, FieldError, InputField } from './accessibility/AccessibleField'
import { GUEST_CUSTOM_FIELD_VALUE_MAX, GUEST_FULL_NAME_MAX, GUEST_GROUP_MAX_MEMBERS, GUEST_NAME_PART_MAX } from '../utils/validation'
import { CustomFieldInput } from './CustomFieldInput'
import { captureException } from '../lib/sentry'
import { getFunctionsErrorMessage } from '../utils/firebaseErrorMessages'
import { trackGuestAdd, trackGuestGroupRegister, trackGuestImport } from '../lib/analytics'
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

function csvJobStatusLabel(job: CsvImportJob): string {
  switch (job.status) {
    case 'pending':
      return 'Preparando la importación…'
    case 'processing':
      return `Importando… ${job.processedRows} / ${job.totalRows}`
    case 'completed':
      return `Importación completa: ${job.successCount} invitado${job.successCount === 1 ? '' : 's'} agregado${job.successCount === 1 ? '' : 's'}`
    case 'completed_with_errors':
      return `Importación completa con ${job.failedCount} rechazo${job.failedCount === 1 ? '' : 's'}: ${job.successCount} agregado${job.successCount === 1 ? '' : 's'}`
    case 'failed':
      return 'La importación falló.'
    case 'cancelled':
      return 'Importación cancelada.'
    default:
      return ''
  }
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
  // Techo real de acompañantes del evento (resolveMaxCompanions(event)) —
  // antes el alta manual solo respetaba el techo técnico GUEST_MAX_COMPANIONS,
  // sin importar la configuración del organizador; ahora respeta la misma
  // que ya aplica auto-registro (rediseño del Dashboard del Evento).
  maxCompanions: number
}) {
  const [mode, setMode] = useState<'single' | 'group' | 'bulk' | 'csv'>('single')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
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
  // Solo cubre el viaje de red para CREAR el job (rápido, no espera a que
  // termine de importar) — separado de `loading` a propósito: mientras el
  // job corre en background (csvJob.status pending/processing) el resto del
  // formulario (agregar uno, familia, lista pegada) sigue disponible.
  const [csvStarting, setCsvStarting] = useState(false)
  const [csvJobId, setCsvJobId] = useState<string | null>(null)
  const [csvJob, setCsvJob] = useState<CsvImportJob | null>(null)
  const announcedCsvJobIdRef = useRef<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [errorAttempt, setErrorAttempt] = useState(0)
  const [pendingDuplicate, setPendingDuplicate] = useState<PendingDuplicate | null>(null)
  // Guard síncrono compartido por single/group/bulk: `loading` (estado de
  // React) ya deshabilita el botón, pero solo desde el próximo render — un
  // doble-tap puede llamar a submit*Guest() dos veces antes de eso. addGuest/
  // addGuestsBulk no tienen idempotencia de servidor (auditoría de
  // estabilidad, evento en vivo), así que un segundo golpe crea un invitado
  // duplicado de verdad. Un solo ref alcanza porque solo un modo/formulario
  // está activo a la vez (ver `mode`).
  const submittingRef = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  useFocusFirstInvalidField(containerRef, errorAttempt)
  const { announce } = useAnnouncer()

  // Sigue el progreso del job de importación mientras exista un jobId — el
  // job en sí lo procesa Cloud Tasks en background (ver
  // src/firebase/csvImportJobs.ts). La reacción a un estado TERMINAL
  // (anunciar, trackear, limpiar el formulario) vive DENTRO del callback de
  // la suscripción a propósito — es "llamar a setState en un callback
  // cuando cambia un sistema externo", el patrón recomendado, no un cuerpo
  // de efecto que dispara setState en cascada por sí mismo. `current` de
  // announcedCsvJobIdRef evita repetir la reacción en cada snapshot
  // mientras el job sigue 'processing'.
  useEffect(() => {
    if (!csvJobId) return
    const unsubscribe = subscribeToCsvImportJob(eventId, csvJobId, (job) => {
      setCsvJob(job)
      if (!job) return
      const terminal = job.status === 'completed' || job.status === 'completed_with_errors'
        || job.status === 'failed' || job.status === 'cancelled'
      if (!terminal || announcedCsvJobIdRef.current === job.id) return
      announcedCsvJobIdRef.current = job.id

      if (job.status === 'completed' || job.status === 'completed_with_errors') {
        trackGuestImport(eventId, 'csv', job.successCount)
        announce(`${job.successCount} invitado${job.successCount === 1 ? '' : 's'} importado${job.successCount === 1 ? '' : 's'}`)
        if (job.failedCount > 0) {
          setError(
            `Se importaron ${job.successCount} de ${job.totalRows} invitados. ` +
            `${job.failedCount} fila${job.failedCount === 1 ? '' : 's'} se rechazó${job.failedCount === 1 ? '' : 'aron'} ` +
            '(formato inválido o cupo del evento alcanzado).',
          )
          setErrorAttempt((n) => n + 1)
        }
        setCsvFileName('')
        setCsvRows([])
        setCsvRowErrors([])
        setCsvHeaderError(null)
      } else if (job.status === 'failed') {
        setError(job.errorMessage || 'Ocurrió un error importando el archivo. Es posible que parte de los invitados ya se hayan guardado — revisa la lista de invitados antes de reintentar.')
        setErrorAttempt((n) => n + 1)
      } else if (job.status === 'cancelled') {
        announce('Importación cancelada')
      }
    }, (err) => {
      captureException(err, { tags: { component: 'guest_add_form', action: 'csv_import_progress' } })
    })
    return unsubscribe
  }, [eventId, csvJobId, announce])

  // Nombre completo normalizado de cada invitado ya cargado — usado para
  // avisar antes de crear un duplicado (mismo invitado agregado 2 veces),
  // tanto al agregar uno por uno como al pegar una lista.
  const existingNames = useMemo(
    () => new Set(guests.map((g) => normalizeName(`${g.name} ${g.lastName || ''}`))),
    [guests],
  )

  // Solo los campos que el organizador marcó `appliesToCompanions` se piden
  // por cada acompañante (mismo criterio que EventJoin.tsx usa para
  // auto-registro) — el resto de customFields solo se le pide al invitado
  // principal, más abajo.
  const companionCustomFields = useMemo(
    () => customFields.filter((f) => f.appliesToCompanions),
    [customFields],
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
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      await addGuest(eventId, { name: name.trim(), lastName: lastName.trim(), companions, customData: customValues })
      trackGuestAdd(eventId)
      announce(`Invitado agregado: ${name.trim()} ${lastName.trim()}`)
      setName('')
      setLastName('')
      setCompanions([])
      setCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_single' } })
      setError(getFunctionsErrorMessage(err, 'No se pudo agregar el invitado. Intenta de nuevo.'))
      setErrorAttempt((n) => n + 1)
    } finally {
      submittingRef.current = false
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
    if (count === null || submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const trimmedGroupName = groupName.trim()
      await addGuest(eventId, {
        name: trimmedGroupName,
        companions: Array.from({ length: Math.max(0, count - 1) }, () => ({})),
        isGroup: true,
        customData: groupCustomValues,
      })
      trackGuestGroupRegister(eventId)
      announce(`Familia o grupo agregado: ${trimmedGroupName}`)
      setGroupName('')
      memberCount.reset(null)
      setGroupCustomValues({})
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_group' } })
      setError(getFunctionsErrorMessage(err, 'No se pudo agregar la familia o grupo. Intenta de nuevo.'))
      setErrorAttempt((n) => n + 1)
    } finally {
      submittingRef.current = false
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
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    setError('')
    try {
      const { added, skippedNames } = await addGuestsBulk(eventId, names)
      trackGuestImport(eventId, 'bulk', added)
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
        getFunctionsErrorMessage(
          err,
          'Ocurrió un error agregando la lista. Es posible que parte de los invitados ya se hayan guardado — revisa la lista de invitados antes de reintentar.',
        ),
      )
      setErrorAttempt((n) => n + 1)
    } finally {
      submittingRef.current = false
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

  // Solo INICIA el job (rápido) — el procesamiento pesado corre en
  // background vía Cloud Tasks, ver processCsvImportChunk.ts. El resultado
  // (added/rejected) llega después por el listener de csvJob, no acá.
  async function submitCsvGuests(rows: ImportedGuestRow[]) {
    setCsvStarting(true)
    setError('')
    try {
      const jobId = await startCsvImportJob(eventId, rows, csvFileName)
      announcedCsvJobIdRef.current = null
      setCsvJob(null)
      setCsvJobId(jobId)
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'add_csv' } })
      setError(getFunctionsErrorMessage(err, 'No se pudo iniciar la importación. Intenta de nuevo.'))
      setErrorAttempt((n) => n + 1)
    } finally {
      setCsvStarting(false)
    }
  }

  const csvJobBusy = csvJob !== null && (csvJob.status === 'pending' || csvJob.status === 'processing')

  function handleCsvImport() {
    if (csvRows.length === 0 || csvStarting || csvJobBusy) return
    const duplicates = findBulkDuplicates(csvRows.map((r) => `${r.name} ${r.lastName || ''}`))
    if (duplicates.length > 0) {
      setPendingDuplicate({ type: 'csv', duplicates })
      return
    }
    void submitCsvGuests(csvRows)
  }

  async function handleCancelCsvImport() {
    if (!csvJob) return
    try {
      await cancelCsvImportJob(eventId, csvJob.id)
    } catch (err) {
      captureException(err, { tags: { component: 'guest_add_form', action: 'cancel_csv_import' } })
      setError(getFunctionsErrorMessage(err, 'No se pudo cancelar la importación.'))
      setErrorAttempt((n) => n + 1)
    }
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          </div>

          <CompanionFieldsEditor
            companions={companions}
            onChange={setCompanions}
            maxCompanions={maxCompanions}
            customFields={companionCustomFields}
          />

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

          {csvJob && (
            <div className="border border-gray-200 rounded-md p-3 space-y-2">
              <p className="text-sm font-medium text-gray-700">{csvJobStatusLabel(csvJob)}</p>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={csvJob.progressPercent} aria-valuemin={0} aria-valuemax={100}>
                <div className="h-full bg-primary transition-all duration-500" style={{ width: `${csvJob.progressPercent}%` }} />
              </div>
              <p className="text-xs text-gray-500">
                {csvJob.processedRows} / {csvJob.totalRows} procesados · {csvJob.successCount} agregados
                {csvJob.failedCount > 0 ? ` · ${csvJob.failedCount} rechazados` : ''}
              </p>
              {csvJobBusy && (
                <AccessibleButton type="button" size="sm" variant="secondary" onClick={() => void handleCancelCsvImport()} className="w-full">
                  Cancelar importación
                </AccessibleButton>
              )}
            </div>
          )}

          <AccessibleButton type="button" size="sm" onClick={handleCsvImport} disabled={csvStarting || csvJobBusy || csvRows.length === 0} className="w-full">
            {csvStarting ? 'Iniciando…' : csvJobBusy ? 'Importando…' : `Importar ${csvRows.length || ''} invitado${csvRows.length === 1 ? '' : 's'}`}
          </AccessibleButton>
          {csvJobBusy && (
            <p className="text-xs text-gray-500">
              La importación sigue en segundo plano — puedes seguir usando el resto del formulario mientras tanto.
            </p>
          )}
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
