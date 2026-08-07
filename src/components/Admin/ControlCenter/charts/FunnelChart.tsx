import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AccessibleChart } from '../../../accessibility/AccessibleChart'

export interface FunnelStep {
  label: string
  count: number
}

interface FunnelChartProps {
  steps: FunnelStep[]
}

const BAR_COLORS = ['var(--color-primary)', 'var(--color-primary)', 'var(--color-success-ink)', 'var(--color-success-ink)', 'var(--color-warning-ink)']

// default export: se monta vía React.lazy() desde FunnelSection.tsx.
export default function FunnelChart({ steps }: FunnelChartProps) {
  const first = steps[0]?.count || 1
  const summary = steps
    .map((s) => `${s.label}: ${s.count} (${Math.round((s.count / first) * 100)}%)`)
    .join('. ')

  return (
    <AccessibleChart summary={summary} caption="Embudo de activación (funnel)">
      <div aria-hidden="true" style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <BarChart data={steps} layout="vertical" margin={{ top: 4, right: 24, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {steps.map((step, i) => (
                <Cell key={step.label} fill={BAR_COLORS[i % BAR_COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </AccessibleChart>
  )
}
