import type { DietaryRestriction, MenuOption } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'

const NAME_MAX = 60
const DESC_MAX = 150
const LABEL_MAX = 40
const MAX_OPTIONS = 10
const MAX_RESTRICTIONS = 10

interface Props {
  menu: { options: MenuOption[]; restrictions: DietaryRestriction[] } | undefined
  onChange: (menu: { options: MenuOption[]; restrictions: DietaryRestriction[] } | undefined) => void
}

// Editor de menú y restricciones alimenticias estructuradas (Feature 6) —
// deliberadamente NO reutiliza CustomFieldsEditor: a diferencia de un
// Dropdown genérico, este modelo es dedicado para poder contar por platillo
// y exportar como reporte de catering (ver GuestData.menuSelection/
// CompanionData.menuSelection). Mismo patrón visual que FaqEditor.tsx
// (useReorderableList, "+ Agregar").
export function MenuEditor({ menu, onChange }: Props) {
  const options = menu?.options || []
  const restrictions = menu?.restrictions || []

  const optionsList = useReorderableList<MenuOption>(options, (v) => onChange({ options: v, restrictions }), { max: MAX_OPTIONS })
  const restrictionsList = useReorderableList<DietaryRestriction>(restrictions, (v) => onChange({ options, restrictions: v }), { max: MAX_RESTRICTIONS })

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Platillos disponibles</p>
        {options.length === 0 && (
          <p className="text-xs text-gray-400">
            Sin platillos aún. Agrega uno para que el invitado elija su menú al confirmar asistencia.
          </p>
        )}
        {options.map((opt, index) => (
          <div key={opt.id} className="flex gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
            <div className="flex-1 space-y-1.5">
              <input
                type="text"
                value={opt.name}
                maxLength={NAME_MAX}
                onChange={(e) => optionsList.update(opt.id, { name: e.target.value })}
                placeholder="Nombre (ej: Pollo al horno)"
                aria-label={`Platillo ${index + 1}`}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
              <input
                type="text"
                value={opt.description || ''}
                maxLength={DESC_MAX}
                onChange={(e) => optionsList.update(opt.id, { description: e.target.value })}
                placeholder="Descripción (opcional)"
                aria-label={`Descripción del platillo ${index + 1}`}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
            </div>
            <AccessibleButton
              iconOnly
              variant="text"
              onClick={() => optionsList.remove(opt.id)}
              aria-label={`Quitar platillo ${index + 1}`}
              className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
            >
              ×
            </AccessibleButton>
          </div>
        ))}
        {optionsList.canAdd && (
          <button
            type="button"
            onClick={() => optionsList.add({ id: crypto.randomUUID(), name: '' })}
            className="text-sm text-primary font-medium hover:underline"
          >
            + Agregar platillo
          </button>
        )}
      </div>

      <div className="space-y-2 pt-3 border-t border-gray-100 dark:border-gray-700">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Restricciones alimenticias</p>
        {restrictions.length === 0 && (
          <p className="text-xs text-gray-400">
            Sin restricciones aún. Agrega opciones como "Vegetariano" o "Alergia" para que el invitado las marque.
          </p>
        )}
        {restrictions.map((r, index) => (
          <div key={r.id} className="flex items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
            <input
              type="text"
              value={r.label}
              maxLength={LABEL_MAX}
              onChange={(e) => restrictionsList.update(r.id, { label: e.target.value })}
              placeholder="Ej: Vegetariano, Alergia"
              aria-label={`Restricción ${index + 1}`}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
            />
            <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0">
              <input
                type="checkbox"
                checked={!!r.requiresNote}
                onChange={(e) => restrictionsList.update(r.id, { requiresNote: e.target.checked })}
              />
              Pide detalle
            </label>
            <AccessibleButton
              iconOnly
              variant="text"
              onClick={() => restrictionsList.remove(r.id)}
              aria-label={`Quitar restricción ${index + 1}`}
              className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
            >
              ×
            </AccessibleButton>
          </div>
        ))}
        {restrictionsList.canAdd && (
          <button
            type="button"
            onClick={() => restrictionsList.add({ id: crypto.randomUUID(), label: '' })}
            className="text-sm text-primary font-medium hover:underline"
          >
            + Agregar restricción
          </button>
        )}
      </div>
    </div>
  )
}
