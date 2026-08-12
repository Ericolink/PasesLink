import type { EventData, GuestData } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { IconMapPin } from '../../accessibility/AccessibleIcon'
import { EventMap } from '../../EventMap'
import { EventWeather } from '../../EventWeather'
import { DepartureReminder } from '../../DepartureReminder'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
  variant?: 'accordion' | 'flat'
}

// Mapa + clima + recordatorio de salida quedan juntos (mismo criterio que ya
// tenían en GuestPass: los 3 dependen de que haya mapsUrl). El fetch del
// clima (useEventWeather, dentro de EventWeather) y el iframe del mapa nunca
// se montan hasta que el invitado abre esta fila — lo resuelve gratis
// AccordionItem (lazy-on-first-open) en modo 'accordion'; en modo 'flat'
// (siempre visible) se montan de una, mismo costo que si el invitado la
// hubiera abierto manualmente.
export function LocationSection({ event, guest, variant }: Props) {
  if (!event.mapsUrl || !isSectionVisibleToGuest(event.sectionVisibility?.map, guest)) return null

  return (
    <EventInfoSection id="location" icon={<IconMapPin className="w-4 h-4" />} title="Ubicación" summary={event.location} variant={variant}>
      <EventMap mapsUrl={event.mapsUrl} />
      <EventWeather event={event} />
      {isSectionVisibleToGuest(event.sectionVisibility?.departureReminder, guest) && <DepartureReminder event={event} />}
    </EventInfoSection>
  )
}
