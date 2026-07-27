import type { InputHTMLAttributes } from 'react'
import { InputField } from './InputField'

type TextFieldSize = 'md' | 'lg'

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'id' | 'required'> {
  label: string
  id?: string
  required?: boolean
  size?: TextFieldSize
  helper?: string
  error?: string | null
  containerClassName?: string
}

const SIZE_CLASS: Record<TextFieldSize, string> = {
  md: 'py-2.5',
  lg: 'py-3',
}

// Envoltorio fino sobre InputField (solo agrega el tamaño md/lg) — ya no
// duplica la lógica de id/aria-describedby/aria-invalid, así que todo
// consumidor existente (Login/Register/ResetPassword/EditEventForm/Step* de
// creación de evento) gana esa asociación sin tocar esos archivos.
export function TextField({
  label,
  size = 'md',
  helper,
  error,
  id,
  required,
  className = '',
  containerClassName = '',
  ...rest
}: TextFieldProps) {
  return (
    <InputField
      label={label}
      id={id}
      required={required}
      error={error}
      hint={helper}
      containerClassName={containerClassName}
      className={`dark:bg-gray-900 dark:text-white px-3 ${SIZE_CLASS[size]} ${className}`}
      {...rest}
    />
  )
}
