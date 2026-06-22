import { useState } from 'react'
import { IconMapPin } from './Icons'
import { extractCoords } from '../utils/extractCoords'

interface Props {
  location: string
  mapsUrl?: string
}

export function EventMap({ location, mapsUrl }: Props) {
  const coords = mapsUrl ? extractCoords(mapsUrl) : null
  const [mapLoaded, setMapLoaded] = useState(false)
  const [mapError, setMapError] = useState(false)

  if (!location && !mapsUrl) return null

  const directionsUrl = mapsUrl
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`

  const showMap = !!coords && !mapError

  return (
    <div className="mt-4 space-y-3">
      {showMap && (
        <div
          className="overflow-hidden rounded-xl border transition-all duration-500"
          style={{ height: mapLoaded ? 220 : 0, opacity: mapLoaded ? 1 : 0, borderColor: 'var(--invite-border)' }}
        >
          <iframe
            src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&output=embed&hl=es&z=16`}
            width="100%"
            height="220"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            title="Mapa del evento"
            onLoad={() => setMapLoaded(true)}
            onError={() => setMapError(true)}
          />
        </div>
      )}

      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full text-white font-semibold py-3 text-sm hover:opacity-90 active:scale-[.98] transition-all shadow-sm bg-[var(--invite-accent)] [border-radius:var(--invite-radius)]"
      >
        <IconMapPin className="w-4 h-4" />
        Cómo llegar
      </a>
    </div>
  )
}
