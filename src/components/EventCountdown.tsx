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

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

// Cuenta atrás hasta que empiece el evento, y una vez empezado: cuenta atrás
// hasta que termine (si hay endTime) o cronómetro de cuánto lleva corriendo
// (si no hay endTime, no hay hora de fin contra la cual contar hacia atrás).
// Sin startTime no hay nada que mostrar — devuelve null.
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

  let label: string
  if (now < start) {
    label = `Comienza en ${formatDuration(start - now)}`
  } else if (end !== null && now < end) {
    label = `Termina en ${formatDuration(end - now)}`
  } else if (end !== null && now >= end) {
    label = 'El evento ya finalizó'
  } else {
    label = `Comenzó hace ${formatDuration(now - start)}`
  }

  return <p className={className}>{label}</p>
}
