import { useMemo } from 'react'
import type { EventData } from '../../types'

const MONTHS = 6
const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function lastNMonthKeys(n: number): { key: string; label: string }[] {
  const now = new Date()
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1)
    return { key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTH_LABELS[d.getMonth()] }
  })
}

export function AdminActivityChart({ events }: { events: EventData[] }) {
  const { months, counts, maxCount } = useMemo(() => {
    const months = lastNMonthKeys(MONTHS)
    const counts = months.map(({ key }) => events.filter((e) => e.date.startsWith(key)).length)
    return { months, counts, maxCount: Math.max(1, ...counts) }
  }, [events])

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
      <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
        Eventos por mes (últimos {MONTHS} meses)
      </p>
      {/* Conteo siempre visible (antes solo con hover, inutilizable en
          touch) con una altura reservada (h-3) para no saltar de layout
          entre meses con/sin eventos — mismo patrón que EventAnalytics.tsx. */}
      <div className="flex items-end gap-2 h-20">
        {months.map(({ key, label }, i) => (
          <div key={key} className="flex-1 flex flex-col items-center gap-1">
            <span className="h-3 text-[10px] text-gray-500 dark:text-gray-400">{counts[i] > 0 ? counts[i] : ''}</span>
            <div className="w-full flex items-end" style={{ height: '60px' }}>
              <div
                className="w-full rounded-t bg-primary/70 transition-colors"
                style={{ height: counts[i] > 0 ? `${Math.max(8, (counts[i] / maxCount) * 100)}%` : '2px' }}
              />
            </div>
            <span className="text-[10px] text-gray-400 dark:text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
