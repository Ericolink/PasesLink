import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AccessibleChart } from '../../../accessibility/AccessibleChart'
import type { TimeSeriesPoint } from '../../../../firebase/admin'

interface GrowthChartProps {
  events: TimeSeriesPoint[]
  users: TimeSeriesPoint[]
}

// default export a propósito: se monta vía React.lazy() desde
// GrowthSection.tsx, para que Recharts (y sus dependencias d3-*) solo se
// descarguen si el admin realmente abre esta sección.
export default function GrowthChart({ events, users }: GrowthChartProps) {
  const data = events.map((point, i) => ({
    date: point.date,
    eventos: point.count,
    clientes: users[i]?.count ?? 0,
  }))
  const totalEvents = events.reduce((sum, p) => sum + p.count, 0)
  const totalUsers = users.reduce((sum, p) => sum + p.count, 0)

  return (
    <AccessibleChart
      summary={`${totalEvents} evento${totalEvents === 1 ? '' : 's'} nuevo${totalEvents === 1 ? '' : 's'} y ${totalUsers} cliente${totalUsers === 1 ? '' : 's'} nuevo${totalUsers === 1 ? '' : 's'} en los últimos ${events.length} días.`}
      caption={`Últimos ${events.length} días`}
    >
      <div aria-hidden="true" style={{ width: '100%', height: 220 }}>
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={(d: string) => d.slice(5)} tick={{ fontSize: 10 }} interval="preserveStartEnd" />
            <YAxis allowDecimals={false} tick={{ fontSize: 10 }} width={28} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Area type="monotone" dataKey="eventos" name="Eventos" stroke="var(--color-primary)" fill="var(--color-primary)" fillOpacity={0.15} strokeWidth={2} />
            <Area type="monotone" dataKey="clientes" name="Clientes" stroke="var(--color-success-ink)" fill="var(--color-success-ink)" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </AccessibleChart>
  )
}
