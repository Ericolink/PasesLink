import type { ReactNode } from 'react'
import { AccordionItem } from '../accessibility/AccessibleAccordion'

interface EventInfoSectionProps {
  id: string
  icon: ReactNode
  title: string
  summary?: string
  defaultExpanded?: boolean
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
export function EventInfoSection({ id, icon, title, summary, defaultExpanded = false, children }: EventInfoSectionProps) {
  return (
    <AccordionItem
      id={id}
      defaultExpanded={defaultExpanded}
      className="border-b border-[var(--invite-border)] last:border-b-0"
      header={
        <span className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-[var(--invite-accent-soft)] text-[var(--invite-accent)]">
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
