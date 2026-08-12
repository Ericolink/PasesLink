import type { EventData, GuestData } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { IconInfo } from '../../accessibility/AccessibleIcon'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
  variant?: 'accordion' | 'flat'
}

// Antes vivían sueltos dentro de la tarjeta boarding-pass (GuestPass.tsx):
// la descripción como <p> siempre visible y el mensaje de bienvenida debajo.
// Se juntan acá como la primera fila del panel (abierta por defecto) para
// liberar espacio vertical de la tarjeta, que ahora solo muestra el grid
// fecha/hora/lugar/vestimenta + countdown.
export function GeneralInfoSection({ event, guest, variant }: Props) {
  const showWelcome = !!event.welcomeMessage && isSectionVisibleToGuest(event.sectionVisibility?.welcomeMessage, guest)
  if (!event.description && !showWelcome) return null

  return (
    <EventInfoSection id="general" icon={<IconInfo className="w-4 h-4" />} title="Información general" defaultExpanded variant={variant}>
      <div className="space-y-3">
        {event.description && <p className="invite-description whitespace-pre-line leading-relaxed">{event.description}</p>}
        {showWelcome && (
          <p className="italic font-medium text-[var(--invite-accent)]">{event.welcomeMessage}</p>
        )}
      </div>
    </EventInfoSection>
  )
}
