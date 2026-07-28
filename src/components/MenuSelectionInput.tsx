import type { DietaryRestriction, MenuOption, MenuSelection } from '../types'

interface Props {
  menu: { options: MenuOption[]; restrictions: DietaryRestriction[] }
  value: MenuSelection | undefined
  onChange: (value: MenuSelection) => void
  // Distingue "menú de Ana" de "menú de su acompañante Juan" cuando se
  // repite este componente por persona (ver GuestPass.tsx/GuestAddForm.tsx).
  personLabel?: string
}

const NOTE_MAX = 200

function toggleRestriction(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((r) => r !== id) : [...selected, id]
}

// Selección de menú + restricciones alimenticias por PERSONA (Feature 6) —
// deliberadamente no reutiliza CustomFieldInput: el modelo dedicado
// (MenuOption/DietaryRestriction) es lo que permite luego contar por
// platillo en Reports/exportación, algo que un Dropdown genérico no
// distingue de cualquier otra pregunta de texto libre.
export function MenuSelectionInput({ menu, value, onChange, personLabel }: Props) {
  const selectedRestrictions = value?.restrictionIds || []
  const anyRestrictionNeedsNote = menu.restrictions.some((r) => r.requiresNote)

  return (
    <div className="space-y-3">
      {personLabel && <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{personLabel}</p>}

      {menu.options.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Platillo</legend>
          {menu.options.map((opt) => (
            <label key={opt.id} className="flex items-start gap-2 text-sm">
              <input
                type="radio"
                name={`menu-option-${personLabel || 'guest'}`}
                checked={value?.optionId === opt.id}
                onChange={() => onChange({ ...value, optionId: opt.id })}
                className="mt-0.5"
              />
              <span>
                <span className="text-gray-900 dark:text-white">{opt.name}</span>
                {opt.description && <span className="text-gray-500 dark:text-gray-400"> — {opt.description}</span>}
              </span>
            </label>
          ))}
        </fieldset>
      )}

      {menu.restrictions.length > 0 && (
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Restricciones alimenticias</legend>
          {menu.restrictions.map((r) => (
            <label key={r.id} className="flex items-center gap-2 text-sm text-gray-900 dark:text-white">
              <input
                type="checkbox"
                checked={selectedRestrictions.includes(r.id)}
                onChange={() => onChange({ ...value, restrictionIds: toggleRestriction(selectedRestrictions, r.id) })}
              />
              {r.label}
            </label>
          ))}
        </fieldset>
      )}

      {anyRestrictionNeedsNote && (
        <textarea
          value={value?.note || ''}
          maxLength={NOTE_MAX}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          placeholder="Detalle (ej: alergia a los frutos secos)"
          aria-label="Detalle de restricción alimenticia"
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
        />
      )}
    </div>
  )
}
