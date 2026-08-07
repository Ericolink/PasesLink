import { MetricTile, type MetricTrend } from '../../MetricTile'
import { useAdminGrowth } from '../../../hooks/useAdminGrowth'
import { attendancePercent } from '../../../utils/attendance'
import type { AdminEventStats, AdminUserStats } from '../../../firebase/admin'
import type { TimeSeriesPoint } from '../../../firebase/admin'
import {
  IconBarChart,
  IconBarChart2,
  IconCalendar,
  IconCheckCircle,
  IconTicket,
  IconUserPlus,
  IconUsers,
} from '../../accessibility/AccessibleIcon'

interface HeroKpiGridProps {
  eventStats: AdminEventStats | null
  userStats: AdminUserStats | null
  loading: boolean
}

// Compara los últimos 7 días contra los 7 anteriores dentro de la misma
// serie de 30 días (useAdminGrowth) — es la única comparación "vs período
// anterior" que se puede calcular sin guardar snapshots históricos de los
// totales acumulados (eventStats/userStats son el total DE SIEMPRE, no
// admiten un "vs. semana pasada" real sin ese historial). Por eso el resto
// de las tarjetas (activos, totales, invitados, check-ins, tasa) se
// muestran SIN trend — mejor sin comparación que una inventada.
function weekOverWeekTrend(series: TimeSeriesPoint[]): { count: number; trend: MetricTrend } | null {
  if (series.length < 14) return null
  const last7 = series.slice(-7).reduce((sum, p) => sum + p.count, 0)
  const prev7 = series.slice(-14, -7).reduce((sum, p) => sum + p.count, 0)
  const direction: MetricTrend['direction'] = last7 === prev7 ? 'flat' : last7 > prev7 ? 'up' : 'down'
  const pct = prev7 === 0 ? (last7 > 0 ? 100 : 0) : Math.round(((last7 - prev7) / prev7) * 100)
  return {
    count: last7,
    trend: { value: `${pct > 0 ? '+' : ''}${pct}%`, direction, label: 'vs. semana anterior' },
  }
}

export function HeroKpiGrid({ eventStats, userStats, loading }: HeroKpiGridProps) {
  const { events: eventsSeries, users: usersSeries, loading: growthLoading } = useAdminGrowth(14)

  const eventsWeek = weekOverWeekTrend(eventsSeries)
  const usersWeek = weekOverWeekTrend(usersSeries)
  const checkinRate = eventStats && eventStats.totalPeople > 0
    ? Math.round(attendancePercent(eventStats.totalCheckins, eventStats.totalPeople))
    : null

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 8 }).map((_, i) => <MetricTile.Skeleton key={i} />)}
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <MetricTile label="Eventos activos" value={eventStats?.activeEvents ?? 0} icon={IconCalendar} align="start" accent="primary" />
      <MetricTile label="Eventos totales" value={eventStats?.totalEvents ?? 0} icon={IconBarChart2} align="start" />
      <MetricTile label="Clientes totales" value={userStats?.totalUsers ?? 0} icon={IconUsers} align="start" />
      <MetricTile
        label="Eventos nuevos (7 días)"
        value={growthLoading ? '…' : eventsWeek?.count ?? 0}
        icon={IconCalendar}
        align="start"
        accent="success"
        trend={eventsWeek?.trend}
      />
      <MetricTile
        label="Clientes nuevos (7 días)"
        value={growthLoading ? '…' : usersWeek?.count ?? 0}
        icon={IconUserPlus}
        align="start"
        accent="success"
        trend={usersWeek?.trend}
      />
      <MetricTile label="Invitados totales" value={eventStats?.totalGuests ?? 0} icon={IconTicket} align="start" />
      <MetricTile label="Check-ins totales" value={eventStats?.totalCheckins ?? 0} icon={IconCheckCircle} align="start" />
      <MetricTile label="Tasa de check-in" value={checkinRate !== null ? `${checkinRate}%` : '—'} icon={IconBarChart} align="start" accent="warning" />
    </div>
  )
}
