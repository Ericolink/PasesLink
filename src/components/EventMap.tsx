import { IconMapPin } from './Icons'

interface Props {
  location: string
  mapsUrl?: string
}

interface Coords { lat: number; lng: number }

function extractCoords(url: string): Coords | null {
  // Standard Google Maps URL: /place/Name/@lat,lng,zoom
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) }
  // ?q=lat,lng format
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/)
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) }
  return null
}

export function EventMap({ location, mapsUrl }: Props) {
  if (!location && !mapsUrl) return null

  const coords = mapsUrl ? extractCoords(mapsUrl) : null
  const directionsUrl = mapsUrl
    || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`

  return (
    <div className="mt-4">
      {coords ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <iframe
            src={`https://maps.google.com/maps?q=${coords.lat},${coords.lng}&output=embed&hl=es&z=16`}
            width="100%"
            height="220"
            style={{ border: 0 }}
            allowFullScreen
            loading="lazy"
            title="Mapa del evento"
          />
        </div>
      ) : mapsUrl ? (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-4 py-3 text-xs text-gray-500 dark:text-gray-400">
          Link de mapa recibido. El mapa interactivo solo se muestra con el enlace completo de Google Maps (no links cortos).
        </div>
      ) : null}

      <a
        href={directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2 flex items-center justify-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <IconMapPin className="w-4 h-4" />
        Cómo llegar
      </a>
    </div>
  )
}
