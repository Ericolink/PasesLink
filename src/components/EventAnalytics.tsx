import { memo, useMemo } from 'react'
import { IconBarChart2 } from './Icons'
import { LoadingInline } from './LoadingInline'
import { partySize } from '../firebase/guests'
import type { GuestData } from '../types'

interface Props {
  guests: GuestData[]
  loading?: boolean
}

export const EventAnalytics = memo(function EventAnalytics({ guests, loading = false }: Props) {
  // Único cálculo costoso del componente (recorre todos los guests para
  // agrupar por hora) — se memoiza para no repetirlo si el padre
  // re-renderiza por otra razón mientras `guests` sigue siendo la misma referencia.
  const stats = useMemo(() => {
    const checkedIn = guests.filter((g) => g.checkedInAt !== null)
    if (checkedIn.length === 0) return null

    // Ponderado por partySize (invitado + acompañantes), no por documento —
    // "Confirmados" debe contar PERSONAS igual que en Reports.tsx/EventDetail.tsx,
    // no invitaciones, para que el mismo dato no muestre números distintos
    // según la pantalla.
    const hourCounts: Record<number, number> = {}
    for (const g of checkedIn) {
      const hour = new Date(g.checkedInAt!).getHours()
      hourCounts[hour] = (hourCounts[hour] || 0) + partySize(g)
    }

    const totalPeople = checkedIn.reduce((sum, g) => sum + partySize(g), 0)
    const hours = Object.keys(hourCounts).map(Number).sort((a, b) => a - b)
    const minHour = Math.max(0, hours[0] - 1)
    const maxHour = Math.min(23, hours[hours.length - 1] + 1)
    const allHours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => minHour + i)
    const maxCount = Math.max(...Object.values(hourCounts))
    const peakHour = hours.reduce((a, b) => (hourCounts[a] > hourCounts[b] ? a : b))
    const avgPerHour = (totalPeople / hours.length).toFixed(1)

    return { totalPeople, hourCounts, allHours, maxCount, peakHour, avgPerHour }
  }, [guests])

  if (loading || !stats) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <IconBarChart2 className="w-4 h-4 text-primary" />
          <h2 className="font-medium text-gray-900 dark:text-white">Analytics</h2>
        </div>
        {loading
          ? <LoadingInline label="Cargando asistentes…" />
          : <p className="text-sm text-gray-400 mt-3 text-center py-4">Aún no hay check-ins registrados.</p>}
      </div>
    )
  }

  const { totalPeople, hourCounts, allHours, maxCount, peakHour, avgPerHour } = stats

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4 mb-4">
      <div className="flex items-center gap-2 mb-4">
        <IconBarChart2 className="w-4 h-4 text-primary" />
        <h2 className="font-medium text-gray-900 dark:text-white">Analytics de llegadas</h2>
      </div>

      <div className="flex gap-4 mb-4 text-center">
        <div className="flex-1 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2">
          <p className="text-lg font-bold text-gray-900 dark:text-white">{totalPeople}</p>
          <p className="text-xs text-gray-500">Confirmados</p>
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

      {/* Bar chart — cada columna tiene un ancho mínimo (min-w-[28px]): con
          pocas horas se reparten todo el ancho igual que antes (flex-1),
          pero en eventos largos con muchas horas dejan de comprimirse por
          debajo de ese mínimo — el conjunto desborda horizontalmente y el
          contenedor scrollea (overflow-x-auto) en vez de aplastar
          etiquetas de 9px hasta volverlas ilegibles. El conteo, antes solo
          visible con hover (sin equivalente en touch), ahora es siempre
          visible con una altura reservada para no saltar de layout entre
          columnas con/sin check-ins. */}
      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex items-end gap-1.5 h-24 min-w-full">
          {allHours.map((h) => {
            const count = hourCounts[h] || 0
            const heightPct = maxCount > 0 ? (count / maxCount) * 100 : 0
            const isPeak = h === peakHour && count > 0
            return (
              <div key={h} className="flex-1 min-w-[28px] flex flex-col items-center gap-0.5">
                <span className="h-3 text-[10px] text-gray-500 dark:text-gray-400">{count > 0 ? count : ''}</span>
                <div className="w-full flex items-end" style={{ height: '80px' }}>
                  <div
                    className={`w-full rounded-t transition-all ${isPeak ? 'bg-primary' : 'bg-primary/40'}`}
                    style={{ height: `${Math.max(heightPct, count > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400">{h}</span>
              </div>
            )
          })}
        </div>
      </div>
      <p className="text-[10px] text-gray-400 text-center mt-1">Hora del día (check-ins)</p>
    </div>
  )
})
