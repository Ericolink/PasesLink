import { useEffect, useMemo, useRef } from 'react'
import confetti from 'canvas-confetti'
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion'
import { IconCheckCircle, IconXCircle } from '../accessibility/AccessibleIcon'
import type { CheckinLog } from '../../types'

interface Props {
  recentCheckins: CheckinLog[]
}

// Ventana de coalescido: si llegan varios check-ins dentro de este margen
// (puerta muy activa), se dispara UN solo burst de confeti en vez de uno por
// invitado — evita degradar rendimiento/saturar la pantalla en un evento
// grande con ingreso masivo simultáneo.
const CONFETTI_COALESCE_MS = 800

// Extraído de HostLive.tsx sin cambios de lógica — protagonista de la etapa
// 'live' del dashboard fusionado (ver Reports.tsx).
export function LiveArrivalsFeed({ recentCheckins }: Props) {
  const prefersReducedMotion = usePrefersReducedMotion()
  const arrivals = useMemo(() => recentCheckins.filter((c) => c.type === 'check_in'), [recentCheckins])

  const seenArrivalIdsRef = useRef<Set<string> | null>(null)
  const burstTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (seenArrivalIdsRef.current === null) {
      // Primera carga: no dispara confeti retroactivo por check-ins previos.
      seenArrivalIdsRef.current = new Set(arrivals.map((a) => a.id))
      return
    }
    const seen = seenArrivalIdsRef.current
    const hasNew = arrivals.some((a) => !seen.has(a.id))
    arrivals.forEach((a) => seen.add(a.id))
    if (hasNew && !prefersReducedMotion) {
      if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
      burstTimerRef.current = setTimeout(() => {
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.3 } })
        burstTimerRef.current = null
      }, CONFETTI_COALESCE_MS)
    }
  }, [arrivals, prefersReducedMotion])

  useEffect(() => () => {
    if (burstTimerRef.current) clearTimeout(burstTimerRef.current)
  }, [])

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 overflow-hidden">
      <h2 className="text-sm font-semibold text-gray-900 dark:text-white px-4 py-3 border-b border-gray-100 dark:border-gray-700">
        Ingresos recientes
      </h2>
      {recentCheckins.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Todavía no hay movimiento.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[50vh] overflow-y-auto">
          {recentCheckins.slice(0, 15).map((entry) => (
            <li key={entry.id} className="flex items-center gap-3 px-4 py-3 animate-fade-in">
              {entry.type === 'entry_blocked' ? (
                <IconXCircle className="w-5 h-5 text-red-500 shrink-0" />
              ) : (
                <IconCheckCircle className="w-5 h-5 text-success-ink shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{entry.guestName}</p>
                <p className="text-xs text-gray-400">
                  {entry.type === 'entry_blocked' ? 'Ingreso rechazado' : entry.reentry ? 'Reingreso' : 'Ingresó'}
                </p>
              </div>
              <span className="text-xs text-gray-400 shrink-0 tabular-nums">
                {new Date(entry.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
