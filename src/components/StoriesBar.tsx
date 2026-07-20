import { useMemo, useState } from 'react'
import type { PhotoData } from '../firebase/photos'
import type { ReactionType } from '../types'
import { optimizedImageUrl } from '../utils/cloudinary'
import { ProgressiveImage } from './ProgressiveImage'
import { PhotoViewer } from './PhotoViewer'

const MAX_STORY_AUTHORS = 30

interface Props {
  eventId: string
  photos: PhotoData[]
  // Pass-through hacia PhotoViewer (modo story) — ver ese componente para el
  // detalle, acá solo se reenvían sin tocarlas.
  myToken?: string
  canReply?: boolean
  onReact?: (photo: PhotoData, type: ReactionType | null) => void
  onReply?: (photo: PhotoData, text: string) => void | Promise<void>
}

interface StoryGroup {
  authorToken: string
  authorName: string
  photos: PhotoData[]
  latestAt: number
}

function seenKey(eventId: string) {
  return `stories_seen_${eventId}`
}

function loadSeenMap(eventId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(seenKey(eventId)) || '{}')
  } catch {
    return {}
  }
}

// Historias del muro: agrupa las fotos por autor (como Instagram/WhatsApp) en
// vez de mostrar un círculo por foto — con varios invitados subiendo varias
// fotos cada uno, un círculo por foto haría la barra interminable y repetiría
// el mismo avatar una y otra vez. Recibe `photos` ya cargadas por el
// llamador (EventWall/WallSection) en vez de pedirlas de nuevo acá: esas
// vistas ya tienen un listener/fetch de fotos para el feed principal, así
// que una segunda lectura de la misma colección sería puro desperdicio.
export function StoriesBar({ eventId, photos, myToken, canReply, onReact, onReply }: Props) {
  const [seenMap, setSeenMap] = useState<Record<string, number>>(() => loadSeenMap(eventId))
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const groups = useMemo<StoryGroup[]>(() => {
    const byAuthor = new Map<string, StoryGroup>()
    for (const photo of photos) {
      const key = photo.authorToken || photo.authorName
      const existing = byAuthor.get(key)
      if (existing) {
        existing.photos.push(photo)
        existing.latestAt = Math.max(existing.latestAt, photo.createdAt)
      } else {
        byAuthor.set(key, { authorToken: key, authorName: photo.authorName, photos: [photo], latestAt: photo.createdAt })
      }
    }
    for (const g of byAuthor.values()) g.photos.sort((a, b) => a.createdAt - b.createdAt)

    // Historias nuevas primero, y dentro de cada grupo por actividad más
    // reciente — así lo que falta por ver siempre queda a mano, sin tener
    // que recorrer toda la barra.
    return Array.from(byAuthor.values())
      .slice(0, MAX_STORY_AUTHORS)
      .sort((a, b) => {
        const aUnseen = (seenMap[a.authorToken] || 0) < a.latestAt
        const bUnseen = (seenMap[b.authorToken] || 0) < b.latestAt
        if (aUnseen !== bUnseen) return aUnseen ? -1 : 1
        return b.latestAt - a.latestAt
      })
    // seenMap intencionalmente fuera de deps: reordenar la barra en vivo cada
    // vez que se marca una foto como vista se sentiría como que "salta" bajo
    // el dedo del usuario mientras mira historias — el orden se recalcula
    // recién en el próximo montaje/actualización de `photos`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos])

  // Fotos de todos los grupos, en el mismo orden que la barra (agrupadas por
  // autor, más reciente primero) — PhotoViewer solo necesita un array plano +
  // índice, así que avanzar/retroceder entre autores es simplemente moverse
  // por este array, sin lógica extra de "saltar de grupo".
  const flatPhotos = useMemo(() => groups.flatMap((g) => g.photos), [groups])
  const groupStartIndex = useMemo(() => {
    const starts = new Map<string, number>()
    let i = 0
    for (const g of groups) {
      starts.set(g.authorToken, i)
      i += g.photos.length
    }
    return starts
  }, [groups])

  if (groups.length === 0) return null

  function openGroup(group: StoryGroup) {
    const lastSeen = seenMap[group.authorToken] || 0
    const firstUnseenOffset = group.photos.findIndex((p) => p.createdAt > lastSeen)
    const startIndex = (groupStartIndex.get(group.authorToken) || 0) + Math.max(0, firstUnseenOffset)
    setActiveIndex(startIndex)
  }

  function markSeen(photo: PhotoData) {
    const key = photo.authorToken || photo.authorName
    setSeenMap((prev) => {
      if ((prev[key] || 0) >= photo.createdAt) return prev
      const next = { ...prev, [key]: photo.createdAt }
      localStorage.setItem(seenKey(eventId), JSON.stringify(next))
      return next
    })
  }

  return (
    <>
      <div className="mb-6 pb-4 border-b" style={{ borderColor: 'var(--invite-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-[var(--invite-text-muted)]">
          Historias
        </p>
        <div className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {groups.map((group) => {
            const isUnseen = (seenMap[group.authorToken] || 0) < group.latestAt
            const cover = group.photos[group.photos.length - 1]
            return (
              <button
                key={group.authorToken}
                onClick={() => openGroup(group)}
                className="shrink-0 flex flex-col items-center gap-1"
              >
                <div
                  className="w-16 h-16 rounded-full p-[2px] transition-all"
                  style={{
                    background: isUnseen
                      ? 'linear-gradient(45deg, var(--invite-accent), #ffb703)'
                      : 'var(--invite-border)',
                  }}
                >
                  <div className="w-full h-full rounded-full overflow-hidden border-2" style={{ borderColor: 'var(--invite-surface, #150D1C)' }}>
                    <ProgressiveImage
                      src={optimizedImageUrl(cover.url, 128)}
                      alt={group.authorName}
                      className="w-full h-full"
                      imgClassName="object-cover"
                      width={120}
                      height={120}
                    />
                  </div>
                </div>
                <span className="text-2xs text-[var(--invite-text-muted)] max-w-[64px] truncate">
                  {group.authorName.split(' ')[0]}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {activeIndex !== null && (
        <PhotoViewer
          photos={flatPhotos}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={() => setActiveIndex(null)}
          onView={markSeen}
          mode="story"
          eventId={eventId}
          myToken={myToken}
          canReply={canReply}
          onReact={onReact}
          onReply={onReply}
        />
      )}
    </>
  )
}
