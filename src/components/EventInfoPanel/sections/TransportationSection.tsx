import type { EventData, GuestData } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { IconCar } from '../../accessibility/AccessibleIcon'
import { TransportSection } from '../../TransportSection'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
}

// El chequeo de "hay contenido" se repite acá (no se importa de
// TransportSection.tsx: esa función queda sin exportar para no violar la
// regla de fast-refresh de solo exportar componentes desde un archivo de
// componente) — mismo criterio que el resto de los módulos, que ya evalúan
// su propia disponibilidad antes de renderizar EventInfoSection.
function hasTransportContent(transport: NonNullable<EventData['transport']>): boolean {
  return !!(transport.options?.length || transport.parkingInfo?.trim() || transport.specialInstructions?.length)
}

export function TransportationSection({ event, guest }: Props) {
  if (!event.transport || !hasTransportContent(event.transport) || !isSectionVisibleToGuest(event.sectionVisibility?.transport, guest)) return null

  return (
    <EventInfoSection id="transport" icon={<IconCar className="w-4 h-4" />} title="Cómo llegar">
      <TransportSection transport={event.transport} />
    </EventInfoSection>
  )
}
