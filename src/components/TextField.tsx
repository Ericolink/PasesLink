import { useId } from 'react'
import type { InputHTMLAttributes } from 'react'
import { FieldError } from './FieldError'

type TextFieldSize = 'md' | 'lg'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  size?: TextFieldSize
  helper?: string
  error?: string | null
  containerClassName?: string
}

const SIZE_CLASS: Record<TextFieldSize, string> = {
  md: 'py-2.5',
  lg: 'py-3',
}

// label + input + helper + error en un solo componente, sobre el patrón que
// ya repetían a mano Login/Register/EditEventForm/Step* — `rounded-lg` es el
// radio de la propuesta de estandarización (no `rounded-md`, el más común
// hoy, a propósito: unifica con el resto de los inputs inline de la app).
export function TextField({
  label,
  size = 'md',
  helper,
  error,
  id,
  className = '',
  containerClassName = '',
  ...rest
}: TextFieldProps) {
  const generatedId = useId()
  const inputId = id || generatedId

  return (
    <div className={containerClassName}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-lg px-3 ${SIZE_CLASS[size]} text-sm focus:outline-none focus:ring-2 focus:ring-primary ${className}`}
        {...rest}
      />
      {helper && !error && <p className="text-xs text-gray-500 mt-1">{helper}</p>}
      <FieldError message={error} />
    </div>
  )
}
