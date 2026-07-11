import { TimelineEditor } from '../../TimelineEditor'
import type { TimelineEntry } from '../../../types'

interface StepScheduleProps {
  timeline: TimelineEntry[]
  onChange: (entries: TimelineEntry[]) => void
}

export function StepSchedule({ timeline, onChange }: StepScheduleProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Opcional. Muestra a tus invitados el orden del día en su pase. Ej: 19:00 Recepción, 20:30 Cena, 22:00 DJ…
      </p>
      <TimelineEditor entries={timeline} onChange={onChange} />
    </>
  )
}
