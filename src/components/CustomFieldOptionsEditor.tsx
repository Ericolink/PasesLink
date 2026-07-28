import type { CustomFieldOption } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'
import { EVENT_CUSTOM_FIELD_OPTIONS_MAX_COUNT, EVENT_CUSTOM_FIELD_OPTIONS_MIN_COUNT } from '../utils/validation'

interface Props {
  options: CustomFieldOption[]
  onChange: (options: CustomFieldOption[]) => void
}

// Sub-editor montado dentro de CustomFieldsBuilder cuando field.type ===
// 'select' — cada opción es lo que el invitado ve en el <select> de su RSVP
// (ver CustomFieldInput.tsx). El id de cada opción (no su label) es lo que se
// guarda como respuesta, así que renombrar una opción existente no rompe
// respuestas ya guardadas.
export function CustomFieldOptionsEditor({ options, onChange }: Props) {
  const list = useReorderableList<CustomFieldOption>(options, onChange, { max: EVENT_CUSTOM_FIELD_OPTIONS_MAX_COUNT })

  return (
    <div className="w-full pl-3 border-l-2 border-gray-200 dark:border-gray-600 space-y-1.5 mt-1">
      {options.map((opt, index) => (
        <div key={opt.id} className="flex items-center gap-1.5">
          <input
            type="text"
            value={opt.label}
            onChange={(e) => list.update(opt.id, { label: e.target.value })}
            placeholder={`Opción ${index + 1}`}
            aria-label={`Opción ${index + 1}`}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
          />
          <AccessibleButton
            iconOnly
            variant="text"
            onClick={() => list.moveUp(opt.id)}
            disabled={index === 0}
            aria-label={`Subir opción ${index + 1}`}
            className="text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-30"
          >
            ▲
          </AccessibleButton>
          <AccessibleButton
            iconOnly
            variant="text"
            onClick={() => list.moveDown(opt.id)}
            disabled={index === options.length - 1}
            aria-label={`Bajar opción ${index + 1}`}
            className="text-gray-400 hover:text-gray-600 shrink-0 disabled:opacity-30"
          >
            ▼
          </AccessibleButton>
          <AccessibleButton
            iconOnly
            variant="text"
            onClick={() => list.remove(opt.id)}
            aria-label={`Quitar opción ${index + 1}`}
            className="text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none"
          >
            ×
          </AccessibleButton>
        </div>
      ))}
      {options.length < EVENT_CUSTOM_FIELD_OPTIONS_MIN_COUNT && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Agrega al menos {EVENT_CUSTOM_FIELD_OPTIONS_MIN_COUNT} opciones.
        </p>
      )}
      {list.canAdd && (
        <button
          type="button"
          onClick={() => list.add({ id: crypto.randomUUID(), label: '' })}
          className="text-xs text-primary font-medium hover:underline"
        >
          + Agregar opción
        </button>
      )}
    </div>
  )
}
