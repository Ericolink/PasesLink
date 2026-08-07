import { useUsageAnalytics } from '../../../hooks/useUsageAnalytics'
import type { EventData } from '../../../types'
import { EmptyState } from '../../Empty/EmptyState'
import { SkeletonBlock } from '../../Skeleton'
import { IconBarChart } from '../../accessibility/AccessibleIcon'

interface UsageAnalyticsSectionProps {
  events: EventData[]
  loading: boolean
}

// No llama a Firestore (ver useUsageAnalytics) — solo agrupa `events`, ya
// cargado por el shell. QR/Compartir/Estadísticas quedan fuera (sin
// instrumentación de uso hoy, ver docs/platform-health-roadmap.md).
export function UsageAnalyticsSection({ events, loading }: UsageAnalyticsSectionProps) {
  const { templateRanking, coOrganizerRate } = useUsageAnalytics(events)

  if (loading) return <SkeletonBlock className="h-32 rounded-lg" />

  if (events.length === 0) {
    return <EmptyState icon={IconBarChart} title="Todavía no hay datos" description="La analítica de uso aparece en cuanto se crea el primer evento." />
  }

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Plantillas más usadas</h3>
        <ul className="space-y-2">
          {templateRanking.map((t) => (
            <li key={t.templateId} className="flex items-center gap-2">
              <span className="text-xs text-gray-700 dark:text-gray-300 flex-1 truncate">{t.label}</span>
              <div className="w-24 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden shrink-0">
                <div className="h-full bg-primary rounded-full" style={{ width: `${t.percent}%` }} />
              </div>
              <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-14 text-right shrink-0">
                {t.count} ({t.percent}%)
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Coorganizadores</h3>
        <p className="text-2xl font-bold tabular-nums text-gray-900 dark:text-white">{coOrganizerRate}%</p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">de los eventos tiene al menos un coorganizador agregado.</p>
      </div>
    </div>
  )
}
