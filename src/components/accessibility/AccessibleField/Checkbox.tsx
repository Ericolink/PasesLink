import { useEffect, useRef } from 'react'
import type { InputHTMLAttributes } from 'react'

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
  // `indeterminate` es una propiedad del elemento DOM, no un atributo HTML
  // (no existe como prop de <input> en React) — solo se puede setear a
  // mano sobre el nodo real, por eso el ref interno más abajo.
  indeterminate?: boolean
}

// Consolida las 4 combinaciones de clases que convivían para el mismo
// control de 16×16px (CustomFieldsBuilder, LegalConsentCheckbox,
// CoOrganizerPermissionsEditor, EditEventForm/StepInvitationMethod) — el
// caller sigue controlando el <label>/texto que lo envuelve, este componente
// es solo el <input> estilizado.
export function Checkbox({ className = '', indeterminate = false, ...rest }: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      className={`w-4 h-4 rounded border-gray-300 dark:border-gray-600 text-primary focus:ring-primary focus:ring-offset-0 ${className}`}
      {...rest}
    />
  )
}
