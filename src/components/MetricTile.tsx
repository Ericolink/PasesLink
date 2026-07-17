import type { ComponentType } from 'react'
import { SkeletonBlock } from './Skeleton'

type MetricAccent = 'primary' | 'success' | 'warning' | 'gray'
type MetricAlign = 'center' | 'start'

interface MetricTileProps {
  label: string
  value: number | string
  sub?: string
  icon?: ComponentType<{ className?: string }>
  /** 'center' (default, ver Reports): valor grande arriba, label debajo.
      'start' (ver Admin): ícono+label arriba a la izquierda, valor debajo. */
  align?: MetricAlign
  accent?: MetricAccent
}

const ACCENT_CLASS: Record<MetricAccent, string> = {
  primary: 'text-primary',
  success: 'text-green-600 dark:text-green-400',
  warning: 'text-amber-600 dark:text-amber-400',
  gray: 'text-gray-900 dark:text-white',
}

// Reemplaza StatCard.tsx y Admin/AdminStatCard.tsx — mismo trabajo (tarjeta
// de métrica numérica) con radio (`rounded-xl`, no `rounded-lg`) y peso de
// fuente (`font-bold`, no `font-semibold`) ya unificados; conserva la
// jerarquía visual propia de cada uno (centrado vs. ícono+label arriba) en
// vez de forzar una sola, porque esa parte sí es una diferencia de
// propósito (KPI destacado vs. panel denso de admin), no una inconsistencia
// (hallazgo C7 de la auditoría). `invite-stat-card` (ver templates.css /
// index.css) es un no-op fuera de EventDetail/Reports — deja intacto el
// borde de acento que ya aplica ahí vía [data-dash-template].
export function MetricTile({ label, value, sub, icon: Icon, align = 'center', accent = 'gray' }: MetricTileProps) {
  return (
    <div className={`invite-stat-card border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 bg-white dark:bg-gray-800 ${align === 'center' ? 'text-center' : ''}`}>
      {Icon ? (
        <>
          <div className="flex items-center gap-1.5 mb-1">
            <Icon className={`w-3.5 h-3.5 ${ACCENT_CLASS[accent]}`} />
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
          <p className={`text-2xl font-bold tabular-nums ${ACCENT_CLASS[accent]}`}>{value}</p>
        </>
      ) : (
        <>
          <p className={`text-2xl font-bold tabular-nums ${ACCENT_CLASS[accent]}`}>{value}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{label}</p>
        </>
      )}
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 leading-tight">{sub}</p>}
    </div>
  )
}

MetricTile.Skeleton = function MetricTileSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 bg-white dark:bg-gray-800">
      <SkeletonBlock className="h-3 w-16 mb-2" />
      <SkeletonBlock className="h-6 w-10" />
    </div>
  )
}
