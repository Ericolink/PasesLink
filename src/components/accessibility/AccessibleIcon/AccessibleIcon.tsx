import type { ComponentType } from 'react'

interface AccessibleIconProps {
  icon: ComponentType<{ className?: string }>
  label: string
  className?: string
}

// Wrapper de composición para el caso "ícono informativo" (transmite algo
// por sí solo, sin texto visible al lado) — no modifica ninguno de los ~65
// íconos de Icons.tsx (todos decorativos por defecto: aria-hidden="true" +
// focusable="false" fijo en su objeto `base`), así que los ~90 usos actuales
// (siempre dentro de un control con su propio aria-label, como AccessibleButton
// iconOnly) siguen exactamente igual. El <span role="img" aria-label> es lo
// que expone el nombre accesible cuando no hay un control envolvente.
export function AccessibleIcon({ icon: Icon, label, className }: AccessibleIconProps) {
  return (
    <span role="img" aria-label={label} className="inline-flex">
      <Icon className={className} />
    </span>
  )
}
