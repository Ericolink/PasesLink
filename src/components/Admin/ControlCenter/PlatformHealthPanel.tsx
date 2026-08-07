import { usePlatformHealth } from '../../../hooks/usePlatformHealth'
import { hasError, type HealthStatus } from '../../../firebase/platformHealth'
import { SkeletonBlock } from '../../Skeleton'
import { EmptyState } from '../../Empty/EmptyState'
import { IconBug, IconDatabase, IconMonitor, IconServer } from '../../accessibility/AccessibleIcon'

const STATUS_PILL_CLASSES: Record<HealthStatus, string> = {
  ok: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  warning: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  error: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  unknown: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}
const STATUS_LABELS: Record<HealthStatus, string> = {
  ok: 'Ok',
  warning: 'Atención',
  error: 'Crítico',
  unknown: 'Sin datos',
}

function StatusPill({ status }: { status: HealthStatus }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  )
}

function formatBytes(bytes: number | null): string {
  if (bytes === null) return '—'
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(0)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

function formatRelativeTime(ms: number): string {
  if (!ms) return '—'
  const diffMin = Math.round((Date.now() - ms) / 60000)
  if (diffMin < 1) return 'hace un momento'
  if (diffMin < 60) return `hace ${diffMin} min`
  return `hace ${Math.round(diffMin / 60)} h`
}

// Único vínculo directo a Cloud Monitoring: la doc de Google en un tab
// nuevo, para que el admin pueda profundizar sin que este panel intente
// replicar el explorador completo de métricas.
const MONITORING_CONSOLE_URL = 'https://console.cloud.google.com/monitoring'

export function PlatformHealthPanel() {
  const { health, loading } = usePlatformHealth()

  if (loading) return <SkeletonBlock className="h-40 rounded-lg" />

  if (!health) {
    return (
      <EmptyState
        icon={IconMonitor}
        title="Todavía no hay datos"
        description="El barrido que alimenta esta sección (refreshPlatformHealth) corre cada 15 minutos — si acaba de desplegarse, esperá a la primera vuelta. Ver docs/platform-health-roadmap.md si nunca llega a aparecer nada."
      />
    )
  }

  return (
    <div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <IconServer className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Cloud Functions</h3>
            </div>
            {!hasError(health.cloudFunctions) && <StatusPill status={health.cloudFunctions.status} />}
          </div>
          {hasError(health.cloudFunctions) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No se pudo leer esta señal en la última vuelta.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {health.cloudFunctions.executionCount} ejecuciones · {health.cloudFunctions.errorRatePercent}% de error
              {health.cloudFunctions.p95LatencyMs !== null && <> · p95 {health.cloudFunctions.p95LatencyMs}ms</>}
            </p>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <IconBug className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Errores (Sentry)</h3>
            </div>
            {!hasError(health.sentry) && <StatusPill status={health.sentry.status} />}
          </div>
          {hasError(health.sentry) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No se pudo leer esta señal en la última vuelta.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {health.sentry.unresolvedCount}{health.sentry.hasMore ? '+' : ''} issue{health.sentry.unresolvedCount === 1 ? '' : 's'} sin resolver (24h)
            </p>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <IconDatabase className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Firestore (últimos {health.windowMinutes} min)</h3>
          </div>
          {hasError(health.firestore) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No se pudo leer esta señal en la última vuelta.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
              {health.firestore.readCount} lecturas · {health.firestore.writeCount} escrituras · {health.firestore.deleteCount} eliminaciones
            </p>
          )}
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <div className="flex items-center gap-2 mb-2">
            <IconDatabase className="w-4 h-4 text-gray-400" />
            <h3 className="text-xs font-medium text-gray-700 dark:text-gray-300">Storage</h3>
          </div>
          {hasError(health.storage) ? (
            <p className="text-xs text-gray-400 dark:text-gray-500">No se pudo leer esta señal en la última vuelta.</p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">{formatBytes(health.storage.totalBytes)} en uso</p>
          )}
        </div>
      </div>

      <p className="text-2xs text-gray-400 dark:text-gray-500 mt-2">
        Actualizado {formatRelativeTime(health.updatedAt)} ·{' '}
        <a href={MONITORING_CONSOLE_URL} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
          Ver Cloud Monitoring
        </a>
      </p>
    </div>
  )
}
