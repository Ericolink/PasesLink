import type { CustomField } from '../types'
import { customFieldInputProps } from '../utils/customFieldInput'

interface FieldRenderProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid': boolean
  required?: boolean
}

interface Props {
  field: CustomField
  fieldProps: FieldRenderProps
  value: string
  onChange: (value: string) => void
  className: string
  placeholder?: string
  maxLength?: number
}

// Único punto de dispatch por CustomField.type — antes cada uno de los 4
// lugares donde el invitado/organizador completa un campo personalizado
// (EventJoin, GuestAddForm x2, CustomFieldsEditor) hacía spread de
// customFieldInputProps directo sobre un <input>, sin ninguno capaz de
// renderizar otro control. Agregar un tipo de pregunta nuevo (checkbox,
// fecha, rating) en el futuro solo debería tocar este archivo.
export function CustomFieldInput({ field, fieldProps, value, onChange, className, placeholder, maxLength }: Props) {
  if (field.type === 'select') {
    return (
      <select
        {...fieldProps}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={className}
      >
        <option value="" disabled hidden>{placeholder || field.label}</option>
        {(field.options || []).map((opt) => (
          <option key={opt.id} value={opt.id}>{opt.label}</option>
        ))}
      </select>
    )
  }

  return (
    <input
      {...fieldProps}
      {...customFieldInputProps(field)}
      maxLength={maxLength}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={className}
    />
  )
}
