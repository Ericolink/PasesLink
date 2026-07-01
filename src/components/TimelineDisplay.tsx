import { formatTime12h } from '../utils/time'
import type { TimelineEntry } from '../types'

interface Props {
  entries: TimelineEntry[]
  className?: string
}

export function TimelineDisplay({ entries, className = '' }: Props) {
  const visible = [...entries]
    .filter((e) => e.time && e.label.trim())
    .sort((a, b) => a.time.localeCompare(b.time))

  if (visible.length === 0) return null

  return (
    <div className={className}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3 text-[var(--invite-text-muted)]">
        Programa
      </p>
      <div className="relative">
        {/* Línea vertical que conecta los puntos */}
        <div
          className="absolute top-1.5 bottom-1.5"
          style={{
            left: 'calc(3rem + 5px)',
            width: '1px',
            background: 'var(--invite-border)',
          }}
        />
        <div className="space-y-3">
          {visible.map((entry, i) => (
            <div key={i} className="flex items-center gap-3">
              <span
                className="w-12 text-right text-xs font-medium shrink-0"
                style={{ color: 'var(--invite-text-muted)' }}
              >
                {formatTime12h(entry.time)}
              </span>
              {/* Punto sobre la línea */}
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 relative z-10 border-2"
                style={{
                  background: 'var(--invite-surface)',
                  borderColor: 'var(--invite-accent)',
                }}
              />
              <span
                className="text-sm leading-snug"
                style={{ color: 'var(--invite-text)' }}
              >
                {entry.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
