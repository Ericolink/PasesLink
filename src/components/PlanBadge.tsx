import type { Plan } from '../types'
import { PLAN_LABELS } from '../types'

export function PlanBadge({ plan }: { plan: Plan }) {
  const styles =
    plan === 'premium'
      ? 'bg-amber-100 text-amber-800 border-amber-300'
      : 'bg-gray-100 text-gray-700 border-gray-300'

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${styles}`}>
      {PLAN_LABELS[plan]}
    </span>
  )
}
