import { useState } from 'react'
import type { CountryCode } from 'libphonenumber-js/min'
import type { CompanionData } from '../types'
import { IconTrash } from './Icons'
import { ConfirmDialog } from './ConfirmDialog'
import { CountryCodeSelect, DEFAULT_PHONE_COUNTRY } from './CountryCodeSelect'

export function CompanionFieldsEditor({
  companions,
  onChange,
  allowAddRemove = true,
  maxCompanions,
}: {
  companions: CompanionData[]
  onChange: (companions: CompanionData[]) => void
  // false para auto-edición del propio invitado (GuestEditModal): esa vía
  // tiene prohibido cambiar la CANTIDAD de acompañantes (ver
  // isValidGuestSelfEdit en firestore.rules) — solo puede editar los datos
  // de los que ya existen, así que ocultar "agregar"/"quitar" evita una UI
  // que promete algo que el guardado va a rechazar.
  allowAddRemove?: boolean
  // Tope de acompañantes configurado para este evento (ver
  // EventData.maxCompanions / resolveMaxCompanions en firebase/guests.ts) —
  // gatea el botón "+ Agregar acompañante" acá; la barrera real (por si
  // alguien evita esta UI) vive en firebase/guests.ts y firestore.rules.
  maxCompanions: number
}) {
  // Confirmación antes de quitar — antes el botón de la papelera borraba la
  // fila al instante, sin deshacer posible ni pregunta, fácil de tocar sin
  // querer en una lista que se toca seguido para editar los campos vecinos.
  const [pendingRemoveIndex, setPendingRemoveIndex] = useState<number | null>(null)

  function addCompanion() {
    onChange([...companions, {}])
  }

  function removeCompanion(index: number) {
    onChange(companions.filter((_, i) => i !== index))
  }

  function updateCompanion(index: number, field: keyof CompanionData, value: string) {
    onChange(companions.map((c, i) => (i === index ? { ...c, [field]: value } : c)))
  }

  const pendingCompanion = pendingRemoveIndex !== null ? companions[pendingRemoveIndex] : null
  const atLimit = companions.length >= maxCompanions

  return (
    <div className="space-y-2">
      {allowAddRemove && (
        atLimit ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {maxCompanions > 0
              ? `Alcanzaste el máximo de acompañantes permitidos para este evento (${maxCompanions}).`
              : 'Este evento no permite acompañantes.'}
          </p>
        ) : (
          <button
            type="button"
            onClick={addCompanion}
            className="text-xs text-primary font-medium hover:underline"
          >
            + Agregar acompañante
          </button>
        )
      )}
      {companions.map((companion, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center bg-gray-50 dark:bg-gray-700/50 rounded-md p-2">
          <input
            type="text"
            placeholder="Nombre (opcional)"
            value={companion.name || ''}
            onChange={(e) => updateCompanion(index, 'name', e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <input
            type="text"
            placeholder="Apellido (opcional)"
            value={companion.lastName || ''}
            onChange={(e) => updateCompanion(index, 'lastName', e.target.value)}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <div className="flex items-center gap-1">
            <CountryCodeSelect
              value={(companion.phoneCountry as CountryCode) || DEFAULT_PHONE_COUNTRY}
              onChange={(v) => updateCompanion(index, 'phoneCountry', v)}
              aria-label="País del teléfono del acompañante"
              className="shrink-0 border border-gray-300 dark:border-gray-600 rounded-md px-1.5 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <input
              type="tel"
              placeholder="Teléfono (opcional)"
              value={companion.phone || ''}
              onChange={(e) => updateCompanion(index, 'phone', e.target.value)}
              className="flex-1 min-w-0 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
            />
            {allowAddRemove && (
              <button
                type="button"
                onClick={() => setPendingRemoveIndex(index)}
                className="shrink-0 min-w-11 min-h-11 inline-flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors"
                aria-label="Eliminar acompañante"
              >
                <IconTrash className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      <ConfirmDialog
        open={pendingRemoveIndex !== null}
        title="¿Quitar acompañante?"
        message={
          pendingCompanion?.name
            ? `Se quitará a "${pendingCompanion.name}${pendingCompanion.lastName ? ` ${pendingCompanion.lastName}` : ''}" de la lista.`
            : 'Se quitará este acompañante de la lista.'
        }
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (pendingRemoveIndex !== null) removeCompanion(pendingRemoveIndex)
          setPendingRemoveIndex(null)
        }}
        onCancel={() => setPendingRemoveIndex(null)}
      />
    </div>
  )
}
