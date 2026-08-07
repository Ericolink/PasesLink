import { useRecentActivity } from '../../../hooks/useRecentActivity'
import type { AdminActivityEntry, AdminActivityKind } from '../../../firebase/adminActivity'
import { ActivityLog, type ActivityLogItem } from '../../ActivityLog'
import { IconCalendar, IconCheckCircle, IconClock, IconTicket, IconUserPlus } from '../../accessibility/AccessibleIcon'

const KIND_ICON: Record<AdminActivityKind, ActivityLogItem['icon']> = {
  user_registered: IconUserPlus,
  event_created: IconCalendar,
  guest_registered: IconTicket,
  checkin: IconCheckCircle,
}

const KIND_VERB: Record<AdminActivityKind, string> = {
  user_registered: 'Nuevo usuario:',
  event_created: 'Nuevo evento:',
  guest_registered: 'Nuevo invitado:',
  checkin: 'Check-in:',
}

function toActivityLogItem(entry: AdminActivityEntry): ActivityLogItem {
  return {
    id: entry.id,
    icon: KIND_ICON[entry.kind],
    timestamp: entry.timestamp,
    text: (
      <>
        <span className="text-gray-400 dark:text-gray-500">{KIND_VERB[entry.kind]}</span>{' '}
        <span className="font-medium">{entry.label}</span>
        {entry.subLabel && <span className="text-gray-400 dark:text-gray-500"> — {entry.subLabel}</span>}
      </>
    ),
  }
}

export function RecentActivityFeed() {
  const { entries, loading } = useRecentActivity()

  return (
    <ActivityLog
      items={entries.map(toActivityLogItem)}
      loading={loading}
      emptyIcon={IconClock}
      emptyTitle="Sin actividad reciente"
      emptyDescription="Los nuevos usuarios, eventos, invitados y check-ins de toda la plataforma van a aparecer acá."
    />
  )
}
