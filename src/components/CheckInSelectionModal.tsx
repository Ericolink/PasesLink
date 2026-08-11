import { useState } from 'react'
import type { GuestData } from '../types'
import { presentIndicesOf } from '../firebase/guests'
import { IconCheckCircle, IconUsers } from './accessibility/AccessibleIcon'
import { useAccessibleModal } from './accessibility/AccessibleModal'
import { Checkbox } from './accessibility/AccessibleField/Checkbox'

export type CheckInPerson = { index: number; label: string }

export type PendingCheckInSelection = {
  qrToken: string
  guestName: string
  // Ya ingresaron en un escaneo anterior de esta misma invitación — se
  // muestran tildados y deshabilitados, no forman parte de la selección que
  // se manda al servidor (reenviarlos no rompe nada, ver planCheckIn en
  // functions/src/checkin/shared.ts, pero no tiene sentido ofrecer
  // destildarlos desde acá).
  alreadyIn: CheckInPerson[]
  // Personas que todavía no entraron — todas empiezan tildadas: "Confirmar"
  // sin tocar nada equivale a "Sí, vienen todos". Destildar antes de
  // confirmar es "No, faltan personas" con selección exacta de quién sí.
  pending: CheckInPerson[]
}

// Etiqueta de una persona dentro de una invitación (0 = invitado principal,
// 1..N = companions[i-1], mismo índice que usa el servidor — ver planCheckIn
// en functions/src/checkin/shared.ts). Los acompañantes de un grupo/familia
// (GuestAddForm.tsx: isGroup) no tienen nombre propio, así que caen al
// fallback numerado. Exportado: lo usan tanto Scanner.tsx (escaneo en la
// puerta) como GuestPass.tsx (organizador que hace check-in manual desde el
// pase de un invitado) — un solo lugar para no repetir este mapeo.
export function personLabel(guest: GuestData, index: number): string {
  if (index === 0) {
    if (guest.isGroup) return guest.name
    return `${guest.name} ${guest.lastName || ''}`.trim() || 'Invitado principal'
  }
  const companion = guest.companions[index - 1]
  const full = `${companion?.name || ''} ${companion?.lastName || ''}`.trim()
  return full || `${guest.isGroup ? 'Integrante' : 'Acompañante'} ${index + 1}`
}

export function buildPendingSelection(qrToken: string, guest: GuestData, pendingIndices: number[]): PendingCheckInSelection {
  const present = new Set(presentIndicesOf(guest))
  const total = 1 + guest.companions.length
  const alreadyIn = Array.from({ length: total }, (_, i) => i)
    .filter((i) => present.has(i))
    .map((index) => ({ index, label: personLabel(guest, index) }))
  const pending = pendingIndices.map((index) => ({ index, label: personLabel(guest, index) }))
  return {
    qrToken,
    guestName: guest.isGroup ? guest.name : `${guest.name} ${guest.lastName || ''}`.trim(),
    alreadyIn,
    pending,
  }
}

// Pantalla de selección del primer escaneo (o de un escaneo posterior sobre
// una invitación parcial) de una invitación con varias personas — familia o
// invitado + acompañantes (ver GuestAddForm.tsx: ambos casos son el mismo
// GuestData con `companions`, sin modelo paralelo). Reemplaza el check-in
// "todo o nada" que asumía que quien trae el QR trae a todo el grupo junto.
export function CheckInSelectionModal({
  selection,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  selection: PendingCheckInSelection
  submitting: boolean
  error: string | null
  onConfirm: (indices: number[]) => void
  onCancel: () => void
}) {
  const [checked, setChecked] = useState<Record<number, boolean>>(
    () => Object.fromEntries(selection.pending.map((p) => [p.index, true])),
  )
  const dialogRef = useAccessibleModal<HTMLDivElement>(true, onCancel)
  const selectedCount = Object.values(checked).filter(Boolean).length

  function toggle(index: number) {
    setChecked((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Personas asociadas a la invitación de ${selection.guestName}`}
        className="bg-gray-800 text-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-sm w-full p-6 animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-center mb-4">
          <IconUsers className="w-12 h-12 mb-2 mx-auto opacity-80" />
          <h2 className="text-xl font-semibold">{selection.guestName}</h2>
          <p className="text-sm opacity-80 mt-1">
            {selection.alreadyIn.length > 0
              ? `${selection.alreadyIn.length} ya ingresaron · ${selection.pending.length} pendiente${selection.pending.length === 1 ? '' : 's'}`
              : `${selection.pending.length} persona${selection.pending.length === 1 ? '' : 's'} asociada${selection.pending.length === 1 ? '' : 's'} — ¿vienen todos?`}
          </p>
        </div>

        <div className="space-y-1 max-h-64 overflow-y-auto mb-4">
          {selection.alreadyIn.map((person) => (
            <div key={person.index} className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 opacity-60">
              <IconCheckCircle className="w-4 h-4 shrink-0 text-success" />
              <span className="text-sm truncate">{person.label}</span>
              <span className="ml-auto text-2xs uppercase tracking-wide shrink-0">Ya ingresó</span>
            </div>
          ))}
          {selection.pending.map((person) => (
            <label
              key={person.index}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
            >
              <Checkbox
                className="border-white/40 bg-transparent"
                checked={checked[person.index] ?? false}
                onChange={() => toggle(person.index)}
                disabled={submitting}
              />
              <span className="text-sm truncate">{person.label}</span>
            </label>
          ))}
        </div>

        {error && <p className="text-sm text-red-300 mb-3 text-center">{error}</p>}

        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => onConfirm(selection.pending.filter((p) => checked[p.index]).map((p) => p.index))}
            disabled={submitting || selectedCount === 0}
            className="min-h-14 inline-flex items-center justify-center gap-2 bg-primary hover:opacity-90 transition-opacity rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            {submitting ? 'Registrando…' : selectedCount === selection.pending.length ? 'Sí, vienen todos' : `Confirmar ingreso (${selectedCount})`}
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 mt-1 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
