import { lazy, Suspense } from 'react'
import { useAdminFunnel } from '../../../hooks/useAdminFunnel'
import { SkeletonBlock } from '../../Skeleton'
import type { FunnelStep } from './charts/FunnelChart'

const FunnelChart = lazy(() => import('./charts/FunnelChart'))

export function FunnelSection() {
  const { stats, loading } = useAdminFunnel()

  if (loading || !stats) return <SkeletonBlock className="h-52 rounded-lg" />

  const steps: FunnelStep[] = [
    { label: 'Se registró', count: stats.registered },
    { label: 'Creó su primer evento', count: stats.createdFirstEvent },
    { label: 'Agregó invitados', count: stats.addedGuests },
    { label: 'Recibió RSVPs', count: stats.receivedRsvps },
    { label: 'Tuvo su primer check-in', count: stats.firstCheckin },
  ]
  const first = steps[0].count || 1

  return (
    <div>
      <Suspense fallback={<SkeletonBlock className="h-52 rounded-lg" />}>
        <FunnelChart steps={steps} />
      </Suspense>

      <ul className="mt-3 space-y-1.5">
        {steps.map((step, i) => {
          const prev = i > 0 ? steps[i - 1].count : null
          const conversionFromPrev = prev !== null && prev > 0 ? Math.round((step.count / prev) * 100) : null
          const dropFromPrev = conversionFromPrev !== null ? 100 - conversionFromPrev : null
          return (
            <li key={step.label} className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>{step.label}</span>
              <span className="tabular-nums">
                <span className="font-medium text-gray-900 dark:text-white">{step.count}</span>{' '}
                ({Math.round((step.count / first) * 100)}% del total
                {conversionFromPrev !== null && <>, {dropFromPrev}% de abandono desde el paso anterior</>})
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-2xs text-gray-400 dark:text-gray-500 mt-2">
        Los primeros dos pasos cuentan usuarios; los últimos tres cuentan eventos (un usuario puede tener varios eventos) — el % de abandono compara volúmenes, no las mismas personas exactas.
      </p>
    </div>
  )
}
