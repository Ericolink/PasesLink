import type { GuestData, VisibilitySection } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { IconSparkles } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  section: VisibilitySection
  guest: GuestData
}

// Reemplaza a CustomSectionCard.tsx dentro del panel — mismas reglas (texto
// plano, sin HTML, para no abrir una superficie de XSS nueva), ahora con el
// mismo look de acordeón que el resto de los módulos. Es el mecanismo hoy
// disponible para cualquier módulo futuro sin campo tipado propio (Hospedaje,
// VIP, After Party, Contacto, Accesibilidad, Recomendaciones...): el
// organizador lo arma desde SectionsEditor sin que nadie tenga que tocar
// EventInformationPanel.
export function CustomInfoSection({ section, guest }: Props) {
  if (!isSectionVisibleToGuest(section.visibility, guest) || !section.body?.trim()) return null

  return (
    <EventInfoSection id={`custom-${section.id}`} icon={<IconSparkles className="w-4 h-4" />} title={section.title}>
      <p className="whitespace-pre-line [font-family:var(--invite-font-secondary,var(--invite-font))]">{section.body}</p>
    </EventInfoSection>
  )
}
