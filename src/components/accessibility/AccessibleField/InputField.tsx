import type { InputHTMLAttributes } from 'react'
import { AccessibleField } from './AccessibleField'

interface InputFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'required'> {
  label: string
  id?: string
  required?: boolean
  error?: string | null
  helperText?: string
  containerClassName?: string
  labelClassName?: string
}

// Azúcar sobre AccessibleField para el caso mayoritario (un <input> de texto/
// tel/email) — reemplaza el patrón "label suelto sin htmlFor" o "solo
// placeholder" que repetían GuestEditModal/EventJoin/GuestAddForm/
// PaymentProofForm/GuestEditForm. Sin estilos de borde/radio propios (esos
// ya los resuelve el CSS global o el `className` de cada llamador, igual que
// TextField.tsx) — solo ancho, tipografía y el wiring de accesibilidad.
export function InputField({
  label,
  id,
  required,
  error,
  helperText,
  containerClassName,
  labelClassName,
  className = '',
  ...rest
}: InputFieldProps) {
  return (
    <AccessibleField
      label={label}
      id={id}
      required={required}
      error={error}
      helperText={helperText}
      className={containerClassName}
      labelClassName={labelClassName}
    >
      {(fieldProps) => (
        <input {...fieldProps} {...rest} className={`w-full text-sm ${className}`} />
      )}
    </AccessibleField>
  )
}
