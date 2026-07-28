import type { CustomField } from '../types'
import { GUEST_CUSTOM_FIELD_VALUE_MAX } from '../utils/validation'
import { AccessibleField } from './accessibility/AccessibleField'
import { CustomFieldInput } from './CustomFieldInput'

const DEFAULT_INPUT_CLASS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2.5 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary'

export function CustomFieldsEditRow({
  customFields,
  values,
  onChange,
  inputClassName = DEFAULT_INPUT_CLASS,
}: {
  customFields: CustomField[]
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  inputClassName?: string
}) {
  if (customFields.length === 0) return null
  return (
    <>
      {customFields.map((field) => (
        // Label real pero oculto (labelClassName="sr-only" por defecto en
        // AccessibleField): el placeholder visible con field.label se conserva tal
        // cual para no cambiar el layout compacto existente, pero ahora el
        // campo tiene nombre accesible propio en vez de depender solo del
        // placeholder (que varios lectores de pantalla no exponen).
        <AccessibleField key={field.id} label={field.label} required={field.required} labelClassName="sr-only">
          {(fieldProps) => (
            <CustomFieldInput
              field={field}
              fieldProps={fieldProps}
              placeholder={field.label}
              maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
              value={values[field.id] || ''}
              onChange={(v) => onChange({ ...values, [field.id]: v })}
              className={inputClassName}
            />
          )}
        </AccessibleField>
      ))}
    </>
  )
}
