import type { EventData } from '../types'
import { useEventWeather } from '../hooks/useEventWeather'

interface Props {
  event: EventData
}

// Sin spinner ni banner de error: a diferencia de EventMap (donde un mapa
// roto sí amerita un mensaje), un widget de clima ausente es de bajo impacto
// — silencio total es preferible a explicarle al invitado por qué no hay
// pronóstico (mapsUrl sin coordenadas, fecha muy lejana, API caída).
export function EventWeather({ event }: Props) {
  const weather = useEventWeather(event)
  if (!weather) return null

  return (
    <div
      className="mt-3 flex items-center justify-center gap-2 text-sm rounded-lg py-2 px-3"
      style={{ color: 'var(--invite-text-muted)', border: '1px solid var(--invite-border)' }}
    >
      <span aria-hidden="true" className="text-lg leading-none">{weather.icon}</span>
      <span>
        {weather.conditionLabel} · {weather.tempMaxC}°/{weather.tempMinC}° previsto
      </span>
    </div>
  )
}
