import { lazy, Suspense } from 'react'
import { useAdminGrowth } from '../../../hooks/useAdminGrowth'
import { SkeletonBlock } from '../../Skeleton'

const GrowthChart = lazy(() => import('./charts/GrowthChart'))

export function GrowthSection() {
  const { events, users, loading } = useAdminGrowth(30)

  if (loading) return <SkeletonBlock className="h-56 rounded-lg" />

  return (
    <Suspense fallback={<SkeletonBlock className="h-56 rounded-lg" />}>
      <GrowthChart events={events} users={users} />
    </Suspense>
  )
}
