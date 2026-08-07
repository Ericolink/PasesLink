import { lazy, Suspense } from 'react'
import { useDeviceBreakdown } from '../../../hooks/useDeviceBreakdown'
import { SkeletonBlock } from '../../Skeleton'
import { EmptyState } from '../../Empty/EmptyState'
import { IconSmartphone } from '../../accessibility/AccessibleIcon'

const DeviceBreakdownChart = lazy(() => import('./charts/DeviceBreakdownChart'))

// El conteo arranca desde que se desplegó esta iteración (ver
// src/firebase/auth.ts → trackDeviceSessionOnce) — sesiones anteriores no
// quedaron registradas, así que el total crece con el tiempo, no es
// retroactivo.
export function DeviceBreakdownSection() {
  const { buckets, loading } = useDeviceBreakdown()

  if (loading) return <SkeletonBlock className="h-40 rounded-lg" />

  if (buckets.length === 0) {
    return (
      <EmptyState
        icon={IconSmartphone}
        title="Todavía no hay datos"
        description="El desglose por dispositivo empieza a llenarse con los próximos inicios de sesión."
      />
    )
  }

  return (
    <Suspense fallback={<SkeletonBlock className="h-40 rounded-lg" />}>
      <DeviceBreakdownChart buckets={buckets} />
    </Suspense>
  )
}
