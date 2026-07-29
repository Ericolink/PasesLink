import { IconClock } from './accessibility/AccessibleIcon'
import { useDepartureReminder } from '../hooks/useDepartureReminder'
import type { EventData } from '../types'
import { formatTimeOfDay } from '../utils/time'

interface Props {
  event: EventData
}

// Tarjeta on-demand (nunca automática): calcular requiere el permiso de
// geolocalización del navegador, que solo se puede pedir con un gesto
// explícito del usuario. Sin mapsUrl/coords o sin startTime válido, el
// widget entero no aparece — mismo criterio de degradación de EventMap/
// EventWeather (silencio total en vez de un mensaje de error).
export function DepartureReminder({ event }: Props) {
  const { state, available, bufferMinutes, setBufferMinutes, eventStartMs, calculate } = useDepartureReminder(event)

  if (!available) return null

  return (
    <div
      className="mt-3 rounded-lg border py-3 px-3 text-sm space-y-2.5"
      style={{ borderColor: 'var(--invite-border)', color: 'var(--invite-text)' }}
    >
      <p className="text-xs font-semibold uppercase tracking-wide flex items-center gap-1.5" style={{ color: 'var(--invite-text-muted)' }}>
        <IconClock className="w-3.5 h-3.5" />
        Hora de salida recomendada
      </p>

      {state.status === 'idle' && (
        <button
          type="button"
          onClick={calculate}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-sm rounded-lg border border-[var(--invite-border)] bg-[var(--invite-surface)] text-[var(--invite-accent)] hover:bg-[var(--invite-accent-soft)] transition-colors"
        >
          Calcular mi hora de salida
        </button>
      )}

      {state.status === 'loading' && (
        <p style={{ color: 'var(--invite-text-muted)' }}>Calculando tu ruta…</p>
      )}

      {state.status === 'error' && (
        <div className="space-y-2">
          <p style={{ color: 'var(--invite-text-muted)' }}>{state.message}</p>
          <button type="button" onClick={calculate} className="text-sm font-medium text-[var(--invite-accent)]">
            Reintentar
          </button>
        </div>
      )}

      {state.status === 'ready' && eventStartMs !== null && (
        <div className="space-y-2">
          <p>
            Para llegar {bufferMinutes} min antes del evento, te recomendamos salir a las{' '}
            <span className="font-semibold">
              {formatTimeOfDay(eventStartMs - (state.base.travelMinutes + bufferMinutes) * 60_000)}
            </span>
            .
          </p>
          <p className="text-xs" style={{ color: 'var(--invite-text-muted)' }}>
            ~{state.base.travelMinutes} min de viaje · {state.base.distanceKm} km
            {!state.base.hasLiveTraffic && ' · estimado sin tráfico en vivo'}
            {state.base.weather && ` · ${state.base.weather.icon} ${state.base.weather.conditionLabel} el día del evento`}
          </p>
          <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--invite-text-muted)' }}>
            <span>Margen:</span>
            <button
              type="button"
              onClick={() => setBufferMinutes(Math.max(0, bufferMinutes - 5))}
              className="w-6 h-6 rounded-full border border-[var(--invite-border)] hover:bg-[var(--invite-accent-soft)]"
              aria-label="Reducir margen 5 minutos"
            >
              −
            </button>
            <span className="font-medium" style={{ color: 'var(--invite-text)' }}>{bufferMinutes} min</span>
            <button
              type="button"
              onClick={() => setBufferMinutes(bufferMinutes + 5)}
              className="w-6 h-6 rounded-full border border-[var(--invite-border)] hover:bg-[var(--invite-accent-soft)]"
              aria-label="Aumentar margen 5 minutos"
            >
              +
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
