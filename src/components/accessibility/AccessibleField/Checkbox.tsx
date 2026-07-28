import type { InputHTMLAttributes } from 'react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>

// Consolida las 4 combinaciones de clases que convivían para el mismo
// control de 16×16px (CustomFieldsBuilder, LegalConsentCheckbox,
// CoOrganizerPermissionsEditor, EditEventForm/StepInvitationMethod) — el
// caller sigue controlando el <label>/texto que lo envuelve, este componente
// es solo el <input> estilizado.
export function Checkbox({ className = '', ...rest }: CheckboxProps) {
  return (
    <input
      type="checkbox"
      className={`w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0 ${className}`}
      {...rest}
    />
  )
}
