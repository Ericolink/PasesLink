import type { EventData, GuestData } from '../../../types'
import { isSectionVisibleToGuest } from '../../../utils/sectionVisibility'
import { IconCalendar } from '../../accessibility/AccessibleIcon'
import { TimelineDisplay } from '../../TimelineDisplay'
import { EventInfoSection } from '../EventInfoSection'

interface Props {
  event: EventData
  guest: GuestData
}

export function ScheduleSection({ event, guest }: Props) {
  if (!event.timeline?.length || !isSectionVisibleToGuest(event.sectionVisibility?.timeline, guest)) return null

  return (
    <EventInfoSection id="schedule" icon={<IconCalendar className="w-4 h-4" />} title="Programa">
      <TimelineDisplay entries={event.timeline} showLabel={false} />
    </EventInfoSection>
  )
}
