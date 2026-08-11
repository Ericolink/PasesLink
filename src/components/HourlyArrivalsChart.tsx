import { memo, useMemo } from 'react'
import { IconBarChart2 } from './accessibility/AccessibleIcon'
import { AccessibleChart } from './accessibility/AccessibleChart'
import { LoadingInline } from './LoadingInline'

interface Props {
  checkinsByHour: Record<string, number>
  loading?: boolean
}

// Reemplaza EventAnalytics.tsx + el bloque "Llegadas por hora" que convivía
// con él en Reports.tsx — eran el mismo gráfico duplicado con dos fuentes de
// datos distintas (uno recorría todos los `guests`, el otro leía
// event.checkinsByHour). Este componente consume solo el contador ya
// agregado server-side (O(1), sin descargar invitados).
export const HourlyArrivalsChart = memo(function HourlyArrivalsChart({ checkinsByHour, loading = false }: Props) {
  const stats = useMemo(() => {
    const entries = Object.entries(checkinsByHour)
    if (entries.length === 0) return null

    const hourCounts = new Map(entries.map(([label, count]) => [Number(label.split(':')[0]), count]))
    const hours = Array.from(hourCounts.keys()).sort((a, b) => a - b)
    const minHour = Math.max(0, hours[0] - 1)
    const maxHour = Math.min(23, hours[hours.length - 1] + 1)
    const allHours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i)

    const total = entries.reduce((sum, [, count]) => sum + count, 0)
    const maxCount = Math.max(...hourCounts.values())
    const peakHour = hours.reduce((a, b) => ((hourCounts.get(a) ?? 0) >= (hourCounts.get(b) ?? 0) ? a : b))
    const avgPerHour = (total / hours.length).toFixed(1)

    return { total, hourCounts, allHours, maxCount, peakHour, avgPerHour }
  }, [checkinsByHour])

  if (loading || !stats) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <IconBarChart2 className="w-4 h-4 text-primary" />
          <h2 className="font-medium text-gray-900 dark:text-white">Llegadas por hora</h2>
        </div>
        {loading
          ? <LoadingInline label="Cargando…" />
          : <p className="text-sm text-gray-400 mt-3 text-center py-4">Aún no hay check-ins registrados.</p>}
      </div>
    )
  }

  const { total, hourCounts, allHours, maxCount, peakHour, avgPerHour } = stats

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <IconBarChart2 className="w-4 h-4 text-primary" />
        <h2 className="font-medium text-gray-900 dark:text-white">Llegadas por hora</h2>
      </div>

      <div className="flex gap-4 mb-4 text-center">
        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{total}</p>
          <p className="text-xs text-gray-500">Check-ins</p>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-lg font-bold text-primary">{peakHour}:00</p>
          <p className="text-xs text-gray-500">Hora pico</p>
        </div>
        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{avgPerHour}</p>
          <p className="text-xs text-gray-500">Promedio/hora</p>
        </div>
      </div>

      <AccessibleChart
        summary={`Llegadas por hora: ${total} check-ins en total, pico de ${maxCount} a las ${peakHour}:00, promedio de ${avgPerHour} por hora.`}
        caption="Hora del día (check-ins)"
      >
        <div className="flex items-end gap-1.5 h-24 min-w-full" aria-hidden="true">
          {allHours.map((h) => {
            const count = hourCounts.get(h) || 0
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0
            const isPeak = h === peakHour && count > 0
            return (
              <div key={h} className="flex-1 min-w-[28px] flex flex-col items-center gap-0.5">
                <span className="h-3 text-2xs text-gray-500 dark:text-gray-400">{count > 0 ? count : ''}</span>
                <div className="w-full flex items-end" style={{ height: '80px' }}>
                  <div
                    className={`w-full rounded-t transition-all ${isPeak ? 'bg-primary' : 'bg-primary/40'}`}
                    style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-2xs text-gray-400">{h}</span>
              </div>
            )
          })}
        </div>
      </AccessibleChart>
    </div>
  )
})
