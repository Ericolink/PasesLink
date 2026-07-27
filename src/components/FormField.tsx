import { useId } from 'react'
import type { ReactNode } from 'react'
import { FieldError } from './FieldError'

interface FieldRenderProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid': boolean
  required?: boolean
}

interface FormFieldProps {
  // ReactNode (no solo string): algunos labels llevan un fragmento de texto
  // secundario inline (ej. "Teléfono (opcional)" con el paréntesis en menor
  // peso) — sigue siendo un <label> con un único htmlFor, solo su contenido
  // visual tiene dos tramos.
  label: ReactNode
  id?: string
  required?: boolean
  error?: string | null
  hint?: string
  className?: string
  // Override para formularios temáticos de cara al invitado (EventJoin,
  // GuestEditModal, PaymentProofForm), que usan colores --invite-* en vez del
  // gris estándar del resto de la app.
  labelClassName?: string
  hintClassName?: string
  children: (fieldProps: FieldRenderProps) => ReactNode
}

// Primitiva compartida de label + hint + error para cualquier control (input
// crudo, stepper, grupo de botones) — un solo lugar que resuelve el `id`
// (useId()), arma `aria-describedby` combinando hint+error, y marca
// `aria-invalid`. Render-prop en vez de `cloneElement`: los controles que
// necesitan esto van desde un <input> a un stepper de acompañantes o un
// grupo de radio, y `cloneElement` es frágil con esa variedad.
//
// No se parte en componentes `Label`/`Hint` sueltos: ningún otro lugar de la
// app necesita esas piezas fuera de este wrapper, así que separarlas sería
// abstracción sin un segundo consumidor real.
const DEFAULT_LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export function FormField({ label, id, required, error, hint, className = '', labelClassName, hintClassName, children }: FormFieldProps) {
  const generatedId = useId()
  const fieldId = id || generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={fieldId} className={labelClassName || DEFAULT_LABEL_CLASS}>
        {label}
        {required && <span aria-hidden="true" className="text-error"> *</span>}
      </label>
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': !!error, required })}
      {hint && !error && <p id={hintId} className={hintClassName || 'text-xs text-gray-500 mt-1'}>{hint}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
