interface StatCardProps {
  label: string
  value: number | string
  sub?: string
  valueClass?: string
}

// Unifica los antiguos `MetricCard` (EventDetail.tsx) y `Stat` (Reports.tsx),
// casi idénticos, en un solo componente reutilizado por la sección de
// Reportes. Conserva `invite-stat-card` (ver templates.css) para que los
// temas cowboy/graduation sigan tematizando estas tarjetas dentro de
// InvitationThemeRoot.
export function StatCard({ label, value, sub, valueClass = 'text-gray-900 dark:text-white' }: StatCardProps) {
  return (
    <div className="invite-stat-card border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 bg-white dark:bg-gray-800 text-center">
      <p className={`text-2xl font-bold tabular-nums ${valueClass}`}>{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}
