import type { ReactNode } from 'react'
import { AccordionItem } from '../accessibility/AccessibleAccordion'

interface EventInfoSectionProps {
  id: string
  icon: ReactNode
  title: string
  summary?: string
  defaultExpanded?: boolean
  // 'accordion' (default) = comportamiento de siempre, fila colapsable
  // dentro de <EventInformationPanel>. 'flat' = misma celda pero como
  // tarjeta propia, siempre expandida, sin depender de <Accordion> (no
  // llama useAccordionContext) — usado por la invitación rediseñada de
  // Fiesta Improvisada, que quiere esta información visible sin acordeón
  // (ver INVITATION_REDESIGN_PLAN). El resto de las plantillas no pasa esta
  // prop y no cambia.
  variant?: 'accordion' | 'flat'
  children: ReactNode
}

// "Celda" visual reutilizable de una fila del EventInformationPanel — ícono +
// título + resumen opcional + contenido expandible, con el lenguaje visual
// ya establecido para secciones de invitación (var(--invite-*), mismo
// criterio que FaqAccordion/TransportSection/CustomSectionCard). No sabe
// nada de EventData: cada módulo (WeatherSection, GiftSection...) decide si
// tiene contenido y devuelve null ANTES de llegar acá — es lo que garantiza
// que el panel nunca muestre una fila vacía, sin que este componente ni
// EventInformationPanel tengan que conocer esa regla por tipo de módulo.
export function EventInfoSection({ id, icon, title, summary, defaultExpanded = false, variant = 'accordion', children }: EventInfoSectionProps) {
  if (variant === 'flat') {
    const headingId = `${id}-flat-heading`
    return (
      <section
        aria-labelledby={headingId}
        className="invite-card border bg-[var(--invite-surface)] text-[var(--invite-text)] [font-family:var(--invite-font)] [border-radius:var(--invite-radius)] p-4 text-left"
        style={{ boxShadow: 'var(--invite-shadow)', borderColor: 'var(--invite-border)' }}
      >
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <span className="invite-icon-badge shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
            {icon}
          </span>
          <div className="min-w-0">
            <h2 id={headingId} className="text-sm font-semibold text-[var(--invite-text)]">{title}</h2>
            {summary && <p className="text-xs text-[var(--invite-text-muted)] truncate">{summary}</p>}
          </div>
        </div>
        <div className="text-sm text-[var(--invite-text)]">{children}</div>
      </section>
    )
  }

  return (
    <AccordionItem
      id={id}
      defaultExpanded={defaultExpanded}
      className="border-b border-[var(--invite-border)] last:border-b-0"
      header={
        <span className="flex items-center gap-3 min-w-0">
          <span className="invite-icon-badge shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
            {icon}
          </span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold text-[var(--invite-text)]">{title}</span>
            {summary && <span className="block text-xs text-[var(--invite-text-muted)] truncate">{summary}</span>}
          </span>
        </span>
      }
    >
      <div className="pb-4 pl-11 pr-1 text-sm text-[var(--invite-text)]">{children}</div>
    </AccordionItem>
  )
}
