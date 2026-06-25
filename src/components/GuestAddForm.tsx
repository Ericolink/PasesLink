import { useMemo, useState } from 'react'
import { addGuest, addGuestsBulk } from '../firebase/guests'
import { CompanionFieldsEditor } from './CompanionFields'
import { ConfirmDialog } from './ConfirmDialog'
import { GUEST_NAME_PART_MAX, GUEST_PHONE_MAX } from '../utils/validation'
import type { CompanionData, GuestData } from '../types'

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function parseBulkNames(raw: string): string[] {
  return raw
    .split('\n')
    .map((n) => n.trim())
    .filter(Boolean)
}

type PendingDuplicate = { type: 'single' } | { type: 'bulk'; duplicates: string[] }

export function GuestAddForm({ eventId, guests }: { eventId: string; guests: GuestData[] }) {
  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [name, setName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [companions, setCompanions] = useState<CompanionData[]>([])
  const [bulkNames, setBulkNames] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [waitlistedMsg, setWaitlistedMsg] = useState('')
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
    setWaitlistedMsg('')
    try {
      const fullName = `${name.trim()} ${lastName.trim()}`
      const result = await addGuest(eventId, { name: name.trim(), lastName: lastName.trim(), phone: phone.trim(), companions })
      if (result.status === 'waitlisted') {
        setWaitlistedMsg(`El cupo está lleno — ${fullName} se agregó a la lista de espera en vez de a los invitados.`)
      }
      setName('')
      setLastName('')
      setPhone('')
      setCompanions([])
    } catch (err) {
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

  async function submitBulkGuests(names: string[]) {
    setLoading(true)
    setError('')
    try {
      await addGuestsBulk(eventId, names)
      setBulkNames('')
    } catch (err) {
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

  function handleConfirmDuplicate() {
    const pending = pendingDuplicate
    setPendingDuplicate(null)
    if (!pending) return
    if (pending.type === 'single') void submitSingleGuest()
    else void submitBulkGuests(parseBulkNames(bulkNames))
  }

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white">
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('single')}
          className={`text-sm px-3 py-1 rounded-md font-medium ${
            mode === 'single' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Agregar uno
        </button>
        <button
          onClick={() => setMode('bulk')}
          className={`text-sm px-3 py-1 rounded-md font-medium ${
            mode === 'bulk' ? 'bg-primary text-white' : 'bg-gray-100 text-gray-600'
          }`}
        >
          Agregar lista
        </button>
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {waitlistedMsg && <p className="text-xs text-amber-600 mb-3">{waitlistedMsg}</p>}

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

          <CompanionFieldsEditor companions={companions} onChange={setCompanions} />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-md py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Agregando…' : 'Agregar invitado'}
          </button>
        </form>
      ) : (
        <form onSubmit={handleBulkSubmit} className="space-y-3">
          <textarea
            placeholder={'Un nombre por línea\nEj.\nJuan Pérez\nMaría López'}
            value={bulkNames}
            onChange={(e) => setBulkNames(e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary text-white rounded-md py-2 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-50"
          >
            {loading ? 'Agregando…' : 'Agregar lista de invitados'}
          </button>
        </form>
      )}

      <ConfirmDialog
        open={pendingDuplicate !== null}
        title="Posible invitado duplicado"
        message={
          pendingDuplicate?.type === 'single'
            ? `${name.trim()} ${lastName.trim()} ya está en la lista de invitados. ¿Agregar de todas formas?`
            : pendingDuplicate?.type === 'bulk'
              ? `${pendingDuplicate.duplicates.length} de los nombres pegados ya están en la lista o se repiten: ${pendingDuplicate.duplicates.join(', ')}. ¿Agregar todos de todas formas?`
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
