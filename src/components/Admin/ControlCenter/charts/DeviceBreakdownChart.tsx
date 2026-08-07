import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AccessibleChart } from '../../../accessibility/AccessibleChart'
import type { DeviceBucket } from '../../../../firebase/deviceStats'

interface DeviceBreakdownChartProps {
  buckets: DeviceBucket[]
}

const OS_LABELS: Record<string, string> = {
  android: 'Android',
  ios: 'iPhone / iPad',
  windows: 'Windows',
  mac: 'macOS',
  linux: 'Linux',
  other: 'Otro',
}
const BROWSER_LABELS: Record<string, string> = {
  chrome: 'Chrome',
  safari: 'Safari',
  firefox: 'Firefox',
  edge: 'Edge',
  other: 'Otro',
}

function buildSeries(buckets: DeviceBucket[], kind: 'os' | 'browser', labels: Record<string, string>) {
  return buckets
    .filter((b) => b.kind === kind)
    .map((b) => ({ label: labels[b.key] || b.key, count: b.count }))
    .sort((a, b) => b.count - a.count)
}

function MiniBarChart({ data }: { data: { label: string; count: number }[] }) {
  return (
    <div aria-hidden="true" style={{ width: '100%', height: 140 }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-gray-200)" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="label" width={80} tick={{ fontSize: 11 }} />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
          <Bar dataKey="count" fill="var(--color-primary)" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

// default export: se monta vía React.lazy() desde DeviceBreakdownSection.tsx.
export default function DeviceBreakdownChart({ buckets }: DeviceBreakdownChartProps) {
  const osData = buildSeries(buckets, 'os', OS_LABELS)
  const browserData = buildSeries(buckets, 'browser', BROWSER_LABELS)
  const summary = [
    `Sistemas operativos: ${osData.map((d) => `${d.label} ${d.count}`).join(', ') || 'sin datos todavía'}.`,
    `Navegadores: ${browserData.map((d) => `${d.label} ${d.count}`).join(', ') || 'sin datos todavía'}.`,
  ].join(' ')

  return (
    <AccessibleChart summary={summary} caption="Sesiones de inicio de sesión, acumuladas desde que se activó el conteo">
      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p aria-hidden="true" className="text-2xs text-gray-400 dark:text-gray-500 mb-1">Sistema operativo</p>
          <MiniBarChart data={osData} />
        </div>
        <div>
          <p aria-hidden="true" className="text-2xs text-gray-400 dark:text-gray-500 mb-1">Navegador</p>
          <MiniBarChart data={browserData} />
        </div>
      </div>
    </AccessibleChart>
  )
}
