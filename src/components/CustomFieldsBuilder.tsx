import type { CustomField, CustomFieldType } from '../types'

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  email: 'Email',
  phone: 'Teléfono',
}

interface Props {
  fields: CustomField[]
  onChange: (fields: CustomField[]) => void
}

export function CustomFieldsBuilder({ fields, onChange }: Props) {
  function addField() {
    const newField: CustomField = {
      id: crypto.randomUUID(),
      label: '',
      type: 'text',
      required: false,
    }
    onChange([...fields, newField])
  }

  function updateField(id: string, patch: Partial<CustomField>) {
    onChange(fields.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function removeField(id: string) {
    onChange(fields.filter((f) => f.id !== id))
  }

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field.id} className="flex flex-wrap items-center gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <input
            type="text"
            value={field.label}
            onChange={(e) => updateField(field.id, { label: e.target.value })}
            placeholder="Nombre del campo (ej: Edad)"
            className="basis-full sm:basis-auto sm:flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
          />
          <select
            value={field.type}
            onChange={(e) => updateField(field.id, { type: e.target.value as CustomFieldType })}
            className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
          >
            {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
              <option key={t} value={t}>{TYPE_LABELS[t]}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={field.required}
              onChange={(e) => updateField(field.id, { required: e.target.checked })}
              className="accent-primary w-4 h-4"
            />
            Obligatorio
          </label>
          <button
            type="button"
            onClick={() => removeField(field.id)}
            aria-label="Eliminar campo"
            className="ml-auto w-9 h-9 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0 text-lg leading-none"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addField}
        className="text-sm text-primary font-medium hover:underline"
      >
        + Agregar campo
      </button>
    </div>
  )
}
