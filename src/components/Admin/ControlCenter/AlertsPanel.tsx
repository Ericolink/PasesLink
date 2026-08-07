import { Link } from 'react-router-dom'
import { useAdminAlerts, type AdminAlert } from '../../../hooks/useAdminAlerts'
import { SkeletonBlock } from '../../Skeleton'
import { IconAlertTriangle, IconCheckCircle, IconXCircle } from '../../accessibility/AccessibleIcon'

const SEVERITY_ICON: Record<AdminAlert['severity'], typeof IconAlertTriangle> = {
  warning: IconAlertTriangle,
  critical: IconXCircle,
}
const SEVERITY_CLASS: Record<AdminAlert['severity'], string> = {
  warning: 'text-warning-ink',
  critical: 'text-red-600 dark:text-red-400',
}

// Solo fuentes reales (sendLog/notificationQueue/csvImportJobs/sendBudget,
// ver useAdminAlerts) — nunca Sentry/Cloud Monitoring (diferido, ver
// docs/platform-health-roadmap.md). Sin alertas activas → estado "todo
// bien" explícito, no un simple EmptyState genérico: es la respuesta más
// común y merece confirmarse con la misma fuerza visual que una alerta real.
export function AlertsPanel() {
  const { alerts, loading } = useAdminAlerts()

  if (loading) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <SkeletonBlock className="h-4 w-2/3" />
      </div>
    )
  }

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 border border-success-ink/20 bg-success-ink/5 rounded-lg px-4 py-3">
        <IconCheckCircle className="w-5 h-5 text-success-ink shrink-0" />
        <p className="text-sm text-success-ink font-medium">Todo funciona correctamente.</p>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 divide-y divide-gray-100 dark:divide-gray-700">
      {alerts.map((alert) => {
        const Icon = SEVERITY_ICON[alert.severity]
        return (
          <div key={alert.id} className="flex items-start gap-3 p-4">
            <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${SEVERITY_CLASS[alert.severity]}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-gray-700 dark:text-gray-300">{alert.text}</p>
              {alert.eventId && (
                <Link to={`/events/${alert.eventId}`} className="text-xs text-primary hover:underline">
                  Ver evento
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
