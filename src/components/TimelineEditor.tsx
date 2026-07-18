import { useId } from 'react'
import type { TimelineEntry } from '../types'
import { IconX } from './Icons'
import { EVENT_TIMELINE_MAX_ENTRIES as TIMELINE_MAX_ENTRIES } from '../utils/validation'

const LABEL_MAX = 80

interface Props {
  entries: TimelineEntry[]
  onChange: (entries: TimelineEntry[]) => void
}

export function TimelineEditor({ entries, onChange }: Props) {
  const baseId = useId()

  function addEntry() {
    if (entries.length >= TIMELINE_MAX_ENTRIES) return
    onChange([...entries, { time: '', label: '' }])
  }

  function updateEntry(index: number, field: keyof TimelineEntry, value: string) {
    onChange(entries.map((e, i) => (i === index ? { ...e, [field]: value } : e)))
  }

  function removeEntry(index: number) {
    onChange(entries.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-gray-400">
          Sin momentos aún. Agrega uno para mostrar el programa del evento a tus invitados.
        </p>
      )}
      {entries.map((entry, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            id={`${baseId}-time-${i}`}
            type="time"
            value={entry.time}
            onChange={(e) => updateEntry(i, 'time', e.target.value)}
            aria-label={`Hora del momento ${i + 1}`}
            className="w-28 shrink-0 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary [color-scheme:light] dark:[color-scheme:dark]"
          />
          <input
            id={`${baseId}-label-${i}`}
            type="text"
            value={entry.label}
            maxLength={LABEL_MAX}
            onChange={(e) => updateEntry(i, 'label', e.target.value)}
            placeholder="Recepción, Cena, DJ…"
            aria-label={`Descripción del momento ${i + 1}`}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => removeEntry(i)}
            aria-label="Eliminar momento"
            className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-red-500 transition-colors shrink-0"
          >
            <IconX className="w-4 h-4" />
          </button>
        </div>
      ))}
      {entries.length < TIMELINE_MAX_ENTRIES && (
        <button
          type="button"
          onClick={addEntry}
          className="text-sm text-primary hover:underline font-medium"
        >
          + Agregar momento
        </button>
      )}
    </div>
  )
}
