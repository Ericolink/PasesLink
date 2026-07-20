import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'danger-outline' | 'text'
type ButtonSize = 'md' | 'sm'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Fuerza `disabled` sin duplicar la condición en el caller — el texto
      del botón durante la carga sigue siendo responsabilidad del caller
      (ej. `{saving ? 'Guardando…' : 'Guardar'}`), Button no inventa un
      label genérico. */
  loading?: boolean
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  secondary: 'border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-outline': 'border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
  // Variante liviana para links inline (ej. "Cerrar" tras enviar un
  // formulario, "Ver primer check-in") — a propósito sin rounded-lg/min-h-11
  // fijos: forzar un tap-target de caja completa ahí cambiaría el layout de
  // texto suelto que hoy conviven en medio de un párrafo, no es un botón
  // independiente que el usuario busque tocar con precisión.
  text: 'text-primary hover:text-primary-dark',
}

const SIZE_CLASS: Record<ButtonSize, string> = {
  md: 'min-h-11 px-4 py-2.5 text-sm rounded-lg',
  sm: 'min-h-11 px-3 py-1.5 text-sm rounded-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className = '',
  children,
  ...rest
}, ref) {
  const boxClass = variant === 'text' ? '' : SIZE_CLASS[size]
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${boxClass} font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})
