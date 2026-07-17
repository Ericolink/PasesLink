import type { AdminAuditLogEntry } from '../../firebase/admin'
import { EmptyState } from '../Empty/EmptyState'
import { IconClock, IconTrash, IconRotateCcw } from '../Icons'
import { SkeletonBlock } from '../Skeleton'

const ACTION_LABELS: Record<AdminAuditLogEntry['action'], string> = {
  event_status_change: 'cambió el estado de',
  event_delete: 'eliminó',
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '—'
  const diffSec = Math.round((Date.now() - ms) / 1000)
  if (diffSec < 60) return 'hace un momento'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `hace ${diffMin} min`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `hace ${diffHour} h`
  const diffDay = Math.round(diffHour / 24)
  return `hace ${diffDay} d`
}

export function AdminActivityLog({ entries, loading }: { entries: AdminAuditLogEntry[]; loading: boolean }) {
  if (!loading && entries.length === 0) {
    return (
      <EmptyState
        icon={IconClock}
        title="Sin actividad todavía"
        description="Los cambios de estado y eliminaciones de eventos hechos desde este panel quedarán registrados aquí."
      />
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
      {loading && Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="p-4">
          <SkeletonBlock className="h-3 w-2/3 mb-2" />
          <SkeletonBlock className="h-2.5 w-1/3" />
        </div>
      ))}
      {!loading && entries.map((entry) => (
        <div key={entry.id} className="flex items-start gap-3 p-4">
          <div className="mt-0.5 text-gray-400 shrink-0">
            {entry.action === 'event_delete' ? <IconTrash className="w-4 h-4" /> : <IconRotateCcw className="w-4 h-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">{entry.adminEmail || entry.adminUid}</span>{' '}
              {ACTION_LABELS[entry.action]}{' '}
              <span className="font-medium">{entry.targetName}</span>
              {entry.meta && <span className="text-gray-400 dark:text-gray-500"> → {entry.meta}</span>}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatRelativeTime(entry.createdAt)}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
