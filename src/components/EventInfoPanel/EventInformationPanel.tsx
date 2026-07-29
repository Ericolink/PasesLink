import { useId, type ReactNode } from 'react'
import { Accordion } from '../accessibility/AccessibleAccordion'

interface EventInformationPanelProps {
  children: ReactNode
}

// Contenedor del Event Information Panel — SOLO composición, orden, estado
// del acordeón y consistencia visual (ver plan de arquitectura). No conoce
// FAQ/clima/transporte/regalos/etc: cada módulo hijo (ver ./sections) decide
// su propia disponibilidad y devuelve null si no tiene datos. Agregar un
// módulo nuevo es agregar una línea de composición en el caller (GuestPass),
// nunca tocar este archivo.
export function EventInformationPanel({ children }: EventInformationPanelProps) {
  const headingId = useId()

  return (
    <section
      aria-labelledby={headingId}
      className="invite-card mt-4 border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] overflow-hidden text-left"
      style={{ boxShadow: 'var(--invite-shadow)', borderColor: 'var(--invite-border)' }}
    >
      <h2 id={headingId} className="px-4 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-[var(--invite-text-muted)]">
        Información del evento
      </h2>
      <Accordion allowMultipleExpanded className="px-4">
        {children}
      </Accordion>
    </section>
  )
}
