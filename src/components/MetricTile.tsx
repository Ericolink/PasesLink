import type { ComponentType } from 'react'
import { SkeletonBlock } from './Skeleton'
import { IconTrendingDown, IconTrendingUp } from './accessibility/AccessibleIcon'

type MetricAccent = 'primary' | 'success' | 'warning' | 'gray'
type MetricAlign = 'center' | 'start'

export interface MetricTrend {
  /** Ya formateado por quien llama (ej. "+12%", "-3") — MetricTile no asume unidad. */
  value: string
  direction: 'up' | 'down' | 'flat'
  /** Ej. "vs. semana anterior" */
  label: string
}

interface MetricTileProps {
  label: string
  value: number | string
  sub?: string
  icon?: ComponentType<{ className?: string }>
  /** 'center' (default, ver Reports): valor grande arriba, label debajo.
      'start' (ver Admin): ícono+label arriba a la izquierda, valor debajo. */
  align?: MetricAlign
  accent?: MetricAccent
  /** Comparación contra el período anterior (Centro de Control) — opcional, ningún caller existente se ve afectado. */
  trend?: MetricTrend
}

// success-ink/warning-ink ya se ramifican solos entre temas (ver
// index.css) — reemplazan los pares green-600/green-400 y amber-600/
// amber-400 sueltos por los tokens semánticos del sistema.
const ACCENT_CLASS: Record<MetricAccent, string> = {
  primary: 'text-primary',
  success: 'text-success-ink',
  warning: 'text-warning-ink',
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
const TREND_CLASS: Record<MetricTrend['direction'], string> = {
  up: 'text-success-ink',
  down: 'text-warning-ink',
  flat: 'text-gray-400 dark:text-gray-500',
}

export function MetricTile({ label, value, sub, icon: Icon, align = 'center', accent = 'gray', trend }: MetricTileProps) {
  // role="group" + aria-label combinando label+valor+sub+trend: sin esto, un
  // lector de pantalla depende del orden del DOM (que además cambia según
  // `align`, ver abajo) para asociar el número con lo que significa — con el
  // grupo nombrado, "Escaneados: 42, 84% del total" se lee como una unidad
  // sin importar el orden visual.
  const groupLabel = `${label}: ${value}${sub ? `, ${sub}` : ''}${trend ? `, ${trend.value} ${trend.label}` : ''}`

  return (
    <div
      role="group"
      aria-label={groupLabel}
      className={`invite-stat-card border border-gray-200 dark:border-gray-700 rounded-xl p-3 sm:p-4 bg-white dark:bg-gray-800 ${align === 'center' ? 'text-center' : ''}`}
    >
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
      {trend && (
        <p aria-hidden="true" className={`flex items-center gap-1 text-xs mt-1 ${align === 'center' ? 'justify-center' : ''} ${TREND_CLASS[trend.direction]}`}>
          {trend.direction === 'up' && <IconTrendingUp className="w-3 h-3 shrink-0" />}
          {trend.direction === 'down' && <IconTrendingDown className="w-3 h-3 shrink-0" />}
          <span className="tabular-nums">{trend.value}</span>
          <span className="text-gray-400 dark:text-gray-500">{trend.label}</span>
        </p>
      )}
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
