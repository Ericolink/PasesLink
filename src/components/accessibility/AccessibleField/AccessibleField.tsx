import { useId } from 'react'
import type { ReactNode } from 'react'
import { FieldError } from './FieldError'

interface FieldRenderProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid': boolean
  required?: boolean
}

interface AccessibleFieldProps {
  // ReactNode (no solo string): algunos labels llevan un fragmento de texto
  // secundario inline (ej. "Teléfono (opcional)" con el paréntesis en menor
  // peso) — sigue siendo un <label> con un único htmlFor, solo su contenido
  // visual tiene dos tramos.
  label: ReactNode
  id?: string
  required?: boolean
  error?: string | null
  helperText?: string
  className?: string
  // Override para formularios temáticos de cara al invitado (EventJoin,
  // GuestEditModal, PaymentProofForm), que usan colores --invite-* en vez del
  // gris estándar del resto de la app.
  labelClassName?: string
  helperClassName?: string
  children: (fieldProps: FieldRenderProps) => ReactNode
}

// Primitiva compartida de label + helperText + error para CUALQUIER control
// (input crudo, textarea, select, stepper, grupo de radio, combobox) — un
// solo lugar que resuelve el `id` (useId()), arma `aria-describedby`
// combinando helperText+error, y marca `aria-invalid`. Render-prop en vez de
// `cloneElement`: los controles que necesitan esto van desde un <input> a un
// stepper de acompañantes o un grupo de radio, y `cloneElement` es frágil
// con esa variedad — el caller decide qué HTML renderiza, este componente
// solo genera y conecta los atributos de accesibilidad.
//
// No se parte en componentes `Label`/`Helper` sueltos: ningún otro lugar de
// la app necesita esas piezas fuera de este wrapper, así que separarlas
// sería abstracción sin un segundo consumidor real.
const DEFAULT_LABEL_CLASS = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1'

export function AccessibleField({ label, id, required, error, helperText, className = '', labelClassName, helperClassName, children }: AccessibleFieldProps) {
  const generatedId = useId()
  const fieldId = id || generatedId
  // helperId solo se genera si el <p> de abajo REALMENTE va a renderizar
  // (helperText Y sin error) — si no, aria-describedby quedaría apuntando a
  // un id que no existe en el DOM (referencia rota, la detecta axe-core).
  const helperId = helperText && !error ? `${fieldId}-helper` : undefined
  const errorId = error ? `${fieldId}-error` : undefined
  const describedBy = [helperId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={className}>
      <label htmlFor={fieldId} className={labelClassName || DEFAULT_LABEL_CLASS}>
        {label}
        {required && <span aria-hidden="true" className="text-error"> *</span>}
      </label>
      {children({ id: fieldId, 'aria-describedby': describedBy, 'aria-invalid': !!error, required })}
      {helperText && !error && <p id={helperId} className={helperClassName || 'text-xs text-gray-500 mt-1'}>{helperText}</p>}
      <FieldError id={errorId} message={error} />
    </div>
  )
}
