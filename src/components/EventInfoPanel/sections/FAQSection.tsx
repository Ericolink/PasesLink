import type { EventData, GuestData } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { Accordion, AccordionItem } from '../../accessibility/AccessibleAccordion'
import { IconHelpCircle } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
}

// Reemplaza a FaqAccordion.tsx (que usaba <details>/<summary> nativo, sin
// aria-expanded/aria-controls). Cada pregunta es su propio AccordionItem
// anidado dentro del Accordion primitivo — reutiliza el mismo componente que
// arma el panel exterior, ahora con semántica ARIA real. No hace falta lazy
// extra para "FAQs extensas": la fila exterior ("Preguntas frecuentes") ya
// no monta nada hasta que el invitado la abre.
export function FAQSection({ event, guest }: Props) {
  if (!event.faq?.length || !isSectionVisibleToGuest(event.sectionVisibility?.faq, guest)) return null

  return (
    <EventInfoSection id="faq" icon={<IconHelpCircle className="w-4 h-4" />} title="Preguntas frecuentes">
      <Accordion allowMultipleExpanded>
        {event.faq.map((entry) => (
          <AccordionItem key={entry.id} id={entry.id} headingLevel={4} header={<span className="text-sm font-medium">{entry.question}</span>}>
            <p className="pb-3 text-sm whitespace-pre-line text-[var(--invite-text-muted)]">{entry.answer}</p>
          </AccordionItem>
        ))}
      </Accordion>
    </EventInfoSection>
  )
}
