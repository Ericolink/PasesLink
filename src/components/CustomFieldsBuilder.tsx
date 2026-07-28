import { useState } from 'react'
import type { CustomField, CustomFieldType } from '../types'
import { ConfirmDialog } from './ConfirmDialog'
import { AccessibleField, Checkbox } from './accessibility/AccessibleField'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { CustomFieldOptionsEditor } from './CustomFieldOptionsEditor'
import { EVENT_CUSTOM_FIELDS_MAX_COUNT } from '../utils/validation'

const TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Texto',
  number: 'Número',
  email: 'Email',
  phone: 'Teléfono',
  select: 'Lista de opciones',
}

interface Props {
  fields: CustomField[]
  onChange: (fields: CustomField[]) => void
}

export function CustomFieldsBuilder({ fields, onChange }: Props) {
  // Confirmación antes de quitar — un campo personalizado puede ya tener
  // datos guardados de invitados existentes; borrarlo de un toque, sin
  // preguntar, hacía fácil perderlo sin querer mientras se edita el campo de
  // al lado.
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null)

  function addField() {
    if (fields.length >= EVENT_CUSTOM_FIELDS_MAX_COUNT) return
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

  const pendingField = fields.find((f) => f.id === pendingRemoveId) || null

  return (
    <div className="space-y-2">
      {fields.map((field, index) => {
        const humanIndex = index + 1
        return (
        <div key={field.id} className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <AccessibleField
            label={`Nombre del campo personalizado ${humanIndex}`}
            labelClassName="sr-only"
            className="basis-full sm:basis-auto sm:flex-1"
          >
            {(fieldProps) => (
              <input
                {...fieldProps}
                type="text"
                value={field.label}
                onChange={(e) => updateField(field.id, { label: e.target.value })}
                placeholder="Nombre del campo (ej: Edad)"
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              />
            )}
          </AccessibleField>
          <AccessibleField label={`Tipo del campo personalizado ${humanIndex}`} labelClassName="sr-only">
            {(fieldProps) => (
              <select
                {...fieldProps}
                value={field.type}
                onChange={(e) => {
                  const nextType = e.target.value as CustomFieldType
                  const needsInitialOptions = nextType === 'select' && !field.options?.length
                  updateField(field.id, {
                    type: nextType,
                    ...(needsInitialOptions
                      ? { options: [{ id: crypto.randomUUID(), label: '' }, { id: crypto.randomUUID(), label: '' }] }
                      : {}),
                  })
                }}
                className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
              >
                {(Object.keys(TYPE_LABELS) as CustomFieldType[]).map((t) => (
                  <option key={t} value={t}>{TYPE_LABELS[t]}</option>
                ))}
              </select>
            )}
          </AccessibleField>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 shrink-0 cursor-pointer">
            <Checkbox
              checked={field.required}
              onChange={(e) => updateField(field.id, { required: e.target.checked })}
            />
            Obligatorio
          </label>
          <AccessibleButton
            iconOnly
            variant="text"
            onClick={() => setPendingRemoveId(field.id)}
            aria-label={`Eliminar campo ${humanIndex}${field.label ? `: ${field.label}` : ''}`}
            className="ml-auto text-gray-400 hover:text-red-500 shrink-0 text-lg leading-none"
          >
            ×
          </AccessibleButton>
        </div>
        {field.type === 'select' && (
          <CustomFieldOptionsEditor
            options={field.options || []}
            onChange={(options) => updateField(field.id, { options })}
          />
        )}
        </div>
        )
      })}
      {fields.length < EVENT_CUSTOM_FIELDS_MAX_COUNT && (
        <button
          type="button"
          onClick={addField}
          className="text-sm text-primary font-medium hover:underline"
        >
          + Agregar campo
        </button>
      )}

      <ConfirmDialog
        open={pendingRemoveId !== null}
        title="¿Quitar este campo?"
        message={
          pendingField?.label
            ? `Se quitará el campo "${pendingField.label}" del formulario de registro. Los datos que ya cargaron los invitados para este campo no se van a mostrar más.`
            : 'Se quitará este campo del formulario de registro.'
        }
        confirmLabel="Quitar"
        danger
        onConfirm={() => {
          if (pendingRemoveId) removeField(pendingRemoveId)
          setPendingRemoveId(null)
        }}
        onCancel={() => setPendingRemoveId(null)}
      />
    </div>
  )
}
