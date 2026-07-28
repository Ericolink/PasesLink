import type { VisibilitySection } from '../types'
import { IconSparkles } from './accessibility/AccessibleIcon'

interface Props {
  section: VisibilitySection
}

// Render de una sección libre del organizador (After Party, Cena VIP,
// Hospedaje...) — mismo lenguaje visual que TransportSection/FaqAccordion
// (título en mayúsculas con --invite-text-muted, cuerpo en --invite-text),
// para no introducir un cuarto patrón de sección en GuestPass. El gating
// por segmento ya se resolvió antes de llegar acá (ver
// isSectionVisibleToGuest en GuestPass.tsx) — este componente solo pinta.
export function CustomSectionCard({ section }: Props) {
  return (
    <div className="mt-4 space-y-1.5 text-left">
      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--invite-text-muted)' }}>
        <IconSparkles className="w-3.5 h-3.5" />
        {section.title}
      </p>
      {section.body && (
        <p
          className="text-sm whitespace-pre-line [font-family:var(--invite-font-secondary,var(--invite-font))]"
          style={{ color: 'var(--invite-text)' }}
        >
          {section.body}
        </p>
      )}
    </div>
  )
}
