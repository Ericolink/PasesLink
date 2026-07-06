import type { ReactNode } from 'react'
import { attendancePercent } from '../utils/attendance'

interface AttendanceProgressBarProps {
  /** Personas que ya hicieron check-in. */
  present: number
  /** Personas esperadas (usar peopleCount, no guestCount, para no pasar de 100% con acompañantes). */
  expected: number
  /** Texto que sigue a "present / expected", ej. "confirmados", "check-ins". */
  unitLabel?: string
  /** 'plain' = estilo Scanner (fondo oscuro fijo, relleno sólido). 'glow' = estilo Dashboard (gradiente + resplandor). */
  variant?: 'plain' | 'glow'
  showPercentage?: boolean
  /** Palabra opcional tras el porcentaje, ej. "asistencia" → "(25% asistencia)". */
  percentSuffix?: string
  /** Contenido extra al final de la fila de texto (ej. badge de cupo). Si se pasa, la fila usa layout "justify-between" en vez de centrado. */
  rightLabel?: ReactNode
  className?: string
}

export function AttendanceProgressBar({
  present,
  expected,
  unitLabel = 'confirmados',
  variant = 'plain',
  showPercentage = true,
  percentSuffix,
  rightLabel,
  className = '',
}: AttendanceProgressBarProps) {
  const percent = attendancePercent(present, expected)
  const percentInt = Math.round(percent)
  const isGlow = variant === 'glow'

  return (
    <div className={className}>
      <div
        className={
          rightLabel
            ? `flex items-center justify-between text-xs mb-1.5 ${isGlow ? 'text-gray-500' : 'text-gray-400'}`
            : `text-center text-sm mb-1 ${isGlow ? 'text-gray-500' : 'text-gray-400'}`
        }
      >
        <span>
          {present} / {expected} {unitLabel}
          {showPercentage && expected > 0 && ` (${percentInt}%${percentSuffix ? ` ${percentSuffix}` : ''})`}
        </span>
        {rightLabel}
      </div>
      <div
        className={`h-1.5 rounded-full overflow-hidden ${isGlow ? '' : 'bg-gray-800'}`}
        style={isGlow ? { background: 'rgba(74,50,92,.8)' } : undefined}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ${isGlow ? '' : 'bg-primary'}`}
          style={
            isGlow
              ? {
                  width: `${percent}%`,
                  background: percent > 0 ? 'linear-gradient(90deg, #FF1464, #D40E52)' : 'transparent',
                  boxShadow: percent > 0 ? '0 0 6px rgba(255,20,100,.5)' : 'none',
                }
              : { width: `${percent}%` }
          }
        />
      </div>
    </div>
  )
}
