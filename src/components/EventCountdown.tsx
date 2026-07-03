import { useEffect, useState } from 'react'

interface Props {
  date: string
  startTime?: string
  endTime?: string
  className?: string
}

function parseLocal(date: string, time: string): number {
  return new Date(`${date}T${time}`).getTime()
}

interface Diff {
  days: number
  hours: number
  minutes: number
  seconds: number
}

function diffParts(ms: number): Diff {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function formatElapsed(ms: number): string {
  const { days, hours, minutes } = diffParts(ms)
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

// Reloj tipo "split-flap" (aeropuerto/estación) — mismo mecanismo para los 6
// temas de invitación y el dashboard del organizador: los colores salen de
// los tokens --invite-* ya definidos por cada tema (registry.ts), con
// fallback al acento de la app cuando no hay InvitationThemeRoot arriba (p.ej.
// EventDetail.tsx para temas sin dashboard tematizado) — así "sigue el estilo
// de cada plantilla" sin agregar un solo bloque nuevo a templates.css.
// Sin startTime no hay nada contra qué contar — devuelve null.
export function EventCountdown({ date, startTime, endTime, className }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!startTime) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [startTime])

  if (!startTime) return null

  const start = parseLocal(date, startTime)
  const end = endTime ? parseLocal(date, endTime) : null

  // Ya terminó, o ya empezó y no hay hora de fin contra la cual contar: texto
  // simple, sin tiles — una cuenta ascendente sin destino no genera
  // anticipación, es solo un cronómetro.
  if (end !== null && now >= end) {
    return <p className={className}>El evento ya finalizó</p>
  }
  if (end === null && now >= start) {
    return <p className={className}>Comenzó hace {formatElapsed(now - start)}</p>
  }

  const target = now < start ? start : end!
  const label = now < start ? 'Comienza en' : 'Termina en'
  const { days, hours, minutes, seconds } = diffParts(target - now)

  const tiles: { value: string; label: string }[] = [
    { value: days > 99 ? String(days) : pad(days), label: 'días' },
    { value: pad(hours), label: 'horas' },
    { value: pad(minutes), label: 'min' },
    { value: pad(seconds), label: 'seg' },
  ]

  return (
    <div className={className}>
      <p
        className="text-xs font-semibold uppercase tracking-wide mb-1.5 text-[var(--invite-text-muted,#a89fb3)]"
      >
        {label}
      </p>
      <div className="grid grid-cols-4 gap-1.5 sm:gap-2 max-w-xs">
        {tiles.map((tile) => (
          <div
            key={tile.label}
            className="relative overflow-hidden text-center py-2 sm:py-2.5 border [border-radius:var(--invite-radius,0.5rem)]"
            style={{
              backgroundColor: 'var(--invite-surface, #1a1130)',
              borderColor: 'var(--invite-border, rgba(144,102,200,.35))',
              boxShadow: 'var(--invite-shadow, 0 2px 8px rgba(0,0,0,.25))',
              fontFamily: 'var(--invite-font, inherit)',
            }}
          >
            <span
              key={tile.value}
              className="countdown-tile-value text-xl sm:text-2xl font-bold tabular-nums text-[var(--invite-text,#f6f4f9)]"
            >
              {tile.value}
            </span>
            {/* Filete del acento — el mismo "objeto de validación mínimo" que ya
                usa el resto del sistema de temas (border-top-color), acá como
                pestaña inferior del tile en vez de la tarjeta completa. */}
            <span
              aria-hidden="true"
              className="absolute bottom-0 left-0 right-0 h-[3px]"
              style={{ backgroundColor: 'var(--invite-accent, #FF1464)' }}
            />
            <p className="mt-1 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wide text-[var(--invite-text-muted,#a89fb3)]">
              {tile.label}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
