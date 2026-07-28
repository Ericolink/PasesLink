import type { FaqEntry } from '../types'

interface Props {
  entries: FaqEntry[]
}

// <details>/<summary> nativo por pregunta — mismo idioma visual/de
// interacción que ReminderSection.tsx, sin sumar una librería de acordeón.
export function FaqAccordion({ entries }: Props) {
  if (!entries.length) return null

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--invite-text-muted)' }}>
        Preguntas frecuentes
      </p>
      <div className="space-y-2">
        {entries.map((entry) => (
          <details
            key={entry.id}
            className="group rounded-lg border overflow-hidden"
            style={{ borderColor: 'var(--invite-border)' }}
          >
            <summary className="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer select-none list-none text-sm font-medium" style={{ color: 'var(--invite-text)' }}>
              {entry.question}
              <span className="text-xs shrink-0" style={{ color: 'var(--invite-text-muted)' }}>
                <span className="group-open:hidden">▾</span>
                <span className="hidden group-open:inline">▴</span>
              </span>
            </summary>
            <p className="px-3 pb-3 text-sm whitespace-pre-line" style={{ color: 'var(--invite-text-muted)' }}>
              {entry.answer}
            </p>
          </details>
        ))}
      </div>
    </div>
  )
}
