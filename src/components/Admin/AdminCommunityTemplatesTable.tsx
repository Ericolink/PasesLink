import { useMemo, useState } from 'react'
import type { CommunityTemplate, CommunityTemplateStatus } from '../../types'
import { EmptyState } from '../Empty/EmptyState'
import { IconEye, IconSparkles } from '../accessibility/AccessibleIcon'
import { formatShortDate } from '../../utils/time'

const STATUS_LABEL: Record<CommunityTemplateStatus, string> = {
  draft: 'Borrador',
  in_review: 'En revisión',
  approved: 'Aprobada',
  rejected: 'Rechazada',
  archived: 'Archivada',
}

const STATUS_PILL_CLASSES: Record<CommunityTemplateStatus, string> = {
  draft: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  in_review: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  approved: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  rejected: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  archived: 'bg-gray-100 text-gray-500 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

interface Props {
  items: CommunityTemplate[]
  loading: boolean
  onOpen: (item: CommunityTemplate) => void
}

// Vista de tarjetas (no ResponsiveTable/paginación como AdminFeedbackTable):
// volumen esperado bajo (catálogo curado, no un buzón de alto tráfico) — ver
// mismo criterio ya documentado en subscribeToAllCommunityTemplates.
export function AdminCommunityTemplatesTable({ items, loading, onOpen }: Props) {
  const [statusFilter, setStatusFilter] = useState<CommunityTemplateStatus | 'all'>('in_review')

  const filtered = useMemo(() => {
    const result = statusFilter === 'all' ? items : items.filter((t) => t.status === statusFilter)
    return [...result].sort((a, b) => b.createdAt - a.createdAt)
  }, [items, statusFilter])

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon={IconSparkles}
        title="Sin plantillas propuestas todavía"
        description="Cuando un diseñador envíe una plantilla a revisión, va a aparecer acá."
      />
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as CommunityTemplateStatus | 'all')}
          aria-label="Filtrar por estado"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {loading && Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="p-4 h-16 animate-pulse bg-gray-50 dark:bg-gray-900/30" />
        ))}
        {!loading && filtered.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item)}
            className="w-full flex items-center gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40"
          >
            <div
              className="w-10 h-10 rounded-lg shrink-0 border border-gray-200 dark:border-gray-600"
              style={{ background: item.vars.accent }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900 dark:text-white truncate">{item.name}</p>
              <p className="text-xs text-gray-400 truncate">
                {item.authorDisplayName} · {item.category} · {formatShortDate(item.createdAt)}
              </p>
            </div>
            <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[item.status]}`}>
              {STATUS_LABEL[item.status]}
            </span>
            <IconEye className="w-4 h-4 shrink-0 text-gray-400" />
          </button>
        ))}
        {!loading && filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-gray-400">No hay plantillas en este estado.</p>
        )}
      </div>
    </div>
  )
}
