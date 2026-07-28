import { useEffect, useState } from 'react'
import { subscribeToSendLog, type SendLogEntry, type SendLogKind } from '../firebase/sendLog'
import { IconBell } from './accessibility/AccessibleIcon'

const KIND_LABELS: Record<SendLogKind, string> = {
  reminder: 'Recordatorio',
  mass_message: 'Mensaje masivo',
}

const STATUS_LABELS: Record<SendLogEntry['status'], string> = {
  sent: 'Enviado',
  failed: 'Falló',
  skipped_no_email: 'Sin email',
  skipped_budget: 'Cupo diario agotado',
}

interface Props {
  eventId: string
}

// Lee events/{eventId}/sendLog (Fase 0.4) — historial de recordatorios de
// RSVP (Fase 5) y mensajería masiva (Fase 6), escrito únicamente por los
// scripts Node. Un solo componente compartido entre ambas features en vez de
// dos listas casi idénticas.
export function SendHistoryPanel({ eventId }: Props) {
  const [entries, setEntries] = useState<SendLogEntry[]>([])
  const [filter, setFilter] = useState<'all' | SendLogKind>('all')

  useEffect(() => {
    const unsubscribe = subscribeToSendLog(eventId, setEntries)
    return unsubscribe
  }, [eventId])

  if (entries.length === 0) return null

  const filtered = filter === 'all' ? entries : entries.filter((e) => e.kind === filter)

  return (
    <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 mb-5">
      <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
        <div className="flex items-center gap-2">
          <IconBell className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Historial de envíos
          </span>
        </div>
        <span className="text-xs text-gray-400">
          <span className="group-open:hidden">▾ Ver</span>
          <span className="hidden group-open:inline">▴ Ocultar</span>
        </span>
      </summary>

      <div className="border-t border-gray-100 dark:border-gray-700 p-5 space-y-3">
        <div className="flex gap-2">
          {(['all', 'reminder', 'mass_message'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilter(k)}
              className={`text-xs rounded-full px-3 py-1 font-medium transition-colors ${
                filter === k ? 'bg-primary text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
              }`}
            >
              {k === 'all' ? 'Todos' : KIND_LABELS[k]}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto">
          {filtered.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="text-gray-900 dark:text-white truncate">{entry.toEmail}</p>
                <p className="text-xs text-gray-400">{KIND_LABELS[entry.kind]} · {new Date(entry.sentAt).toLocaleString('es')}</p>
              </div>
              <span className={`text-xs shrink-0 font-medium ${entry.status === 'sent' ? 'text-green-600' : 'text-amber-600'}`}>
                {STATUS_LABELS[entry.status]}
              </span>
            </div>
          ))}
        </div>
      </div>
    </details>
  )
}
