import type { CustomField } from '../types'
import { GUEST_CUSTOM_FIELD_VALUE_MAX } from '../utils/validation'
import { customFieldInputProps } from '../utils/customFieldInput'

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
        <input
          key={field.id}
          {...customFieldInputProps(field.type)}
          placeholder={field.label}
          maxLength={GUEST_CUSTOM_FIELD_VALUE_MAX}
          value={values[field.id] || ''}
          onChange={(e) => onChange({ ...values, [field.id]: e.target.value })}
          className={inputClassName}
        />
      ))}
    </>
  )
}
