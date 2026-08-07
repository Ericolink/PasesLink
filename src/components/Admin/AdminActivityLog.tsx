import type { AdminAuditLogEntry } from '../../firebase/admin'
import { ActivityLog, type ActivityLogItem } from '../ActivityLog'
import { IconClock, IconTrash, IconRotateCcw } from '../accessibility/AccessibleIcon'

const ACTION_LABELS: Record<AdminAuditLogEntry['action'], string> = {
  event_status_change: 'cambió el estado de',
  event_delete: 'eliminó',
}

function toActivityLogItem(entry: AdminAuditLogEntry): ActivityLogItem {
  return {
    id: entry.id,
    icon: entry.action === 'event_delete' ? IconTrash : IconRotateCcw,
    timestamp: entry.createdAt,
    text: (
      <>
        <span className="font-medium">{entry.adminEmail || entry.adminUid}</span> {ACTION_LABELS[entry.action]}{' '}
        <span className="font-medium">{entry.targetName}</span>
        {entry.meta && <span className="text-gray-400 dark:text-gray-500"> → {entry.meta}</span>}
      </>
    ),
  }
}

export function AdminActivityLog({ entries, loading }: { entries: AdminAuditLogEntry[]; loading: boolean }) {
  return (
    <ActivityLog
      items={entries.map(toActivityLogItem)}
      loading={loading}
      emptyIcon={IconClock}
      emptyTitle="Sin actividad todavía"
      emptyDescription="Los cambios de estado y eliminaciones de eventos hechos desde este panel quedarán registrados aquí."
    />
  )
}
