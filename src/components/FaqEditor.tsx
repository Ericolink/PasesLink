import type { FaqEntry } from '../types'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { useReorderableList } from '../hooks/useReorderableList'
import { EVENT_FAQ_MAX_ENTRIES } from '../utils/validation'

const QUESTION_MAX = 150
const ANSWER_MAX = 1000

interface Props {
  entries: FaqEntry[]
  onChange: (entries: FaqEntry[]) => void
}

// Gemelo de TimelineEditor.tsx, con reorden (useReorderableList) porque el
// orden de las preguntas sí importa de cara al invitado (FaqAccordion.tsx
// las muestra en el mismo orden).
export function FaqEditor({ entries, onChange }: Props) {
  const list = useReorderableList<FaqEntry>(entries, onChange, { max: EVENT_FAQ_MAX_ENTRIES })

  return (
    <div className="space-y-2">
      {entries.length === 0 && (
        <p className="text-xs text-gray-400">
          Sin preguntas frecuentes aún. Agrega una para resolver dudas comunes (código de vestimenta, estacionamiento, niños) sin llenar la descripción del evento.
        </p>
      )}
      {entries.map((entry, index) => (
        <div key={entry.id} className="flex gap-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <div className="flex-1 space-y-1.5">
            <input
              type="text"
              value={entry.question}
              maxLength={QUESTION_MAX}
              onChange={(e) => list.update(entry.id, { question: e.target.value })}
              placeholder="Pregunta (ej: ¿Hay estacionamiento?)"
              aria-label={`Pregunta ${index + 1}`}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800"
            />
            <textarea
              value={entry.answer}
              maxLength={ANSWER_MAX}
              onChange={(e) => list.update(entry.id, { answer: e.target.value })}
              placeholder="Respuesta"
              aria-label={`Respuesta ${index + 1}`}
              rows={2}
              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-gray-800 resize-y"
            />
          </div>
          <div className="flex flex-col gap-1 shrink-0">
            <AccessibleButton
              iconOnly
              variant="text"
              onClick={() => list.moveUp(entry.id)}
              disabled={index === 0}
              aria-label={`Subir pregunta ${index + 1}`}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              ▲
            </AccessibleButton>
            <AccessibleButton
              iconOnly
              variant="text"
              onClick={() => list.moveDown(entry.id)}
              disabled={index === entries.length - 1}
              aria-label={`Bajar pregunta ${index + 1}`}
              className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
            >
              ▼
            </AccessibleButton>
            <AccessibleButton
              iconOnly
              variant="text"
              onClick={() => list.remove(entry.id)}
              aria-label={`Quitar pregunta ${index + 1}`}
              className="text-gray-400 hover:text-red-500 text-lg leading-none"
            >
              ×
            </AccessibleButton>
          </div>
        </div>
      ))}
      {list.canAdd && (
        <button
          type="button"
          onClick={() => list.add({ id: crypto.randomUUID(), question: '', answer: '' })}
          className="text-sm text-primary font-medium hover:underline"
        >
          + Agregar pregunta
        </button>
      )}
    </div>
  )
}
