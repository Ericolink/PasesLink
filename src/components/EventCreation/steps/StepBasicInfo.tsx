import { EventScheduleField } from '../../EventScheduleField'
import { EVENT_NAME_MAX } from '../../../utils/validationRules'

interface StepBasicInfoProps {
  name: string
  onNameChange: (value: string) => void
  location: string
  onLocationChange: (value: string) => void
  date: string
  onDateChange: (value: string) => void
  dateMin?: string
  startTime: string
  onStartTimeChange: (value: string) => void
  endTime: string
  onEndTimeChange: (value: string) => void
}

export function StepBasicInfo({
  name,
  onNameChange,
  location,
  onLocationChange,
  date,
  onDateChange,
  dateMin,
  startTime,
  onStartTimeChange,
  endTime,
  onEndTimeChange,
}: StepBasicInfoProps) {
  return (
    <>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Solo toma 30 segundos. El resto del diseño lo personalizás en los próximos pasos.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="event-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Nombre del evento *
          </label>
          <input
            id="event-name"
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Mi graduación, Boda de Ana y Luis…"
            maxLength={EVENT_NAME_MAX}
            autoFocus
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <label htmlFor="event-location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Lugar *
          </label>
          <input
            id="event-location"
            type="text"
            value={location}
            onChange={(e) => onLocationChange(e.target.value)}
            placeholder="Salón Los Olivos"
            className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <p className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Fecha y hora *
          </p>
          <EventScheduleField
            date={date}
            onDateChange={onDateChange}
            dateMin={dateMin}
            startTime={startTime}
            onStartTimeChange={onStartTimeChange}
            endTime={endTime}
            onEndTimeChange={onEndTimeChange}
          />
        </div>
      </div>
    </>
  )
}
