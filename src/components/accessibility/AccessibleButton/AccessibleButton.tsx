import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'secondary' | 'tonal' | 'danger' | 'danger-outline' | 'text'
type ButtonSize = 'md' | 'sm'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-dark',
  // Superficie + borde marcado (Design Memory: "secundario = surface + borde
  // border-strong, no relleno gris") — antes era un borde gris plano sin
  // fondo propio. Solo se agrega fondo en CLARO (dark:bg-transparent
  // restaura el resto original, transparente salvo hover, para no tocar
  // la apariencia oscura). border-gray-300 sin dark: aparte: el bloque
  // `.dark .border-gray-300` de index.css ya lo pisa con !important para
  // todo el app (mismo trato que cualquier otro borde de tarjeta en oscuro).
  secondary: 'bg-surface dark:bg-transparent border border-gray-300 text-gray-700 dark:text-gray-300 shadow-[var(--shadow-xs)] dark:shadow-none hover:bg-[var(--hover)] dark:hover:bg-gray-700',
  // Tonal (subtle+ink de la familia primary) — variante que pedía la Design
  // Memory y no existía: para acciones secundarias con más peso que "text"
  // pero sin la formalidad de un borde.
  tonal: 'bg-primary-subtle text-primary-ink dark:text-primary hover:bg-primary-subtle-border/60',
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

// icon-only siempre 44×44 (WCAG 2.5.5/2.5.8) y circular — el tamaño ya no
// depende de `size`, mismo trato que tenía IconButton por separado.
const ICON_ONLY_CLASS = 'min-w-11 min-h-11 inline-flex items-center justify-center rounded-full'

type CommonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Fuerza `disabled` sin duplicar la condición en el caller — el texto
      del botón durante la carga sigue siendo responsabilidad del caller
      (ej. `{saving ? 'Guardando…' : 'Guardar'}`), AccessibleButton no
      inventa un label genérico. */
  loading?: boolean
}

export type AccessibleButtonProps =
  | (CommonProps & {
      /** Botón normal, con contenido visible (texto y/o ícono). */
      iconOnly?: false
      'aria-label'?: string
    })
  | (CommonProps & {
      /** Solo ícono, sin texto visible — `aria-label` pasa a ser
          OBLIGATORIO a nivel de tipo: sin esto, tsc no compila. Evita el gap
          real que tenían varios botones icon-only antes de IconButton (sin
          nombre accesible). */
      iconOnly: true
      'aria-label': string
    })

// Fusiona lo que antes eran Button.tsx + IconButton.tsx en una sola API —
// un botón normal y uno icon-only son la MISMA primitiva con distinto
// tamaño/forma, no dos sistemas de clases paralelos. `focus-visible` vive acá
// una sola vez para las 6 variantes (antes solo lo traía IconButton; Button
// no lo tenía explícito).
export const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(function AccessibleButton(
  { variant = 'primary', size = 'md', loading = false, iconOnly = false, disabled, className = '', type, children, ...rest },
  ref,
) {
  const boxClass = iconOnly ? ICON_ONLY_CLASS : variant === 'text' ? '' : SIZE_CLASS[size]
  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading}
      className={`${boxClass} font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
})
