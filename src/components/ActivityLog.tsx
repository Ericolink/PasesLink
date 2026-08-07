import type { ComponentType, ReactNode } from 'react'
import { EmptyState } from './Empty/EmptyState'
import { SkeletonBlock } from './Skeleton'

export interface ActivityLogItem {
  id: string
  icon: ComponentType<{ className?: string }>
  text: ReactNode
  timestamp: number
}

interface ActivityLogProps {
  items: ActivityLogItem[]
  loading: boolean
  emptyIcon: ComponentType<{ className?: string }>
  emptyTitle: string
  emptyDescription: string
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

// Generaliza el layout que antes vivía solo en Admin/AdminActivityLog.tsx
// (bitácora de auditoría) — mismo divide-y + ícono + texto + timestamp
// relativo + skeleton/empty, ahora reusado también por el feed de actividad
// en vivo del Centro de Control (ver Admin/ControlCenter/RecentActivityFeed.tsx).
export function ActivityLog({ items, loading, emptyIcon, emptyTitle, emptyDescription }: ActivityLogProps) {
  if (!loading && items.length === 0) {
    return <EmptyState icon={emptyIcon} title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
      {loading &&
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="p-4">
            <SkeletonBlock className="h-3 w-2/3 mb-2" />
            <SkeletonBlock className="h-2.5 w-1/3" />
          </div>
        ))}
      {!loading &&
        items.map((item) => {
          const Icon = item.icon
          return (
            <div key={item.id} className="flex items-start gap-3 p-4">
              <div className="mt-0.5 text-gray-400 shrink-0">
                <Icon className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700 dark:text-gray-300">{item.text}</p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{formatRelativeTime(item.timestamp)}</p>
              </div>
            </div>
          )
        })}
    </div>
  )
}
