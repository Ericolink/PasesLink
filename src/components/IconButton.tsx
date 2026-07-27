import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Obligatorio (no opcional, a diferencia del atributo HTML nativo) — un
      botón que solo muestra un ícono no tiene nombre accesible sin esto. */
  'aria-label': string
}

// Primitiva para botones icon-only nuevos: 44×44 (WCAG 2.5.5/2.5.8) y foco
// visible vienen incluidos por default, así no puede repetirse el gap real
// que tenían CoOrganizerPanel/EventWall/GuestSearchSheet/GuestSelectionBar
// (sin ninguno de los dos). `aria-label` obligatorio a nivel de tipo evita
// el otro gap posible: un ícono sin nombre accesible.
//
// No migra los 29+ botones icon-only que ya cumplían a mano (mismo patrón
// `min-w-11 min-h-11` + aria-label) — no están rotos, tocarlos sería puro
// churn visual sin beneficio. Queda como el estándar para código nuevo.
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { className = '', type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={`min-w-11 min-h-11 inline-flex items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${className}`}
      {...rest}
    />
  )
})
