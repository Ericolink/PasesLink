import { useEffect, useState } from 'react'
import { fetchPhotos } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { optimizedImageUrl } from '../utils/cloudinary'
import { PhotoViewer } from './PhotoViewer'

const MAX_STORIES = 20

interface Props {
  eventId: string
}

export function StoriesBar({ eventId }: Props) {
  const [photos, setPhotos] = useState<PhotoData[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  useEffect(() => {
    fetchPhotos(eventId).then((all) => setPhotos(all.slice(0, MAX_STORIES)))
  }, [eventId])

  if (photos.length === 0) return null

  return (
    <>
      {/* Horizontal story thumbnails */}
      <div className="mt-6 pt-4 border-t" style={{ borderColor: 'var(--invite-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-3 text-[var(--invite-text-muted)]">
          Momentos del evento
        </p>
        <div className="flex gap-2.5 overflow-x-auto pb-1 scrollbar-hide">
          {photos.map((photo, i) => (
            <button
              key={photo.id}
              onClick={() => setActiveIndex(i)}
              className="shrink-0 flex flex-col items-center gap-1"
            >
              <div
                className="w-14 h-14 rounded-full overflow-hidden border-2 transition-all"
                style={{ borderColor: 'var(--invite-accent)' }}
              >
                <img
                  src={optimizedImageUrl(photo.url, 120)}
                  alt={photo.authorName}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
              <span className="text-[10px] text-[var(--invite-text-muted)] max-w-[56px] truncate">
                {photo.authorName.split(' ')[0]}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeIndex !== null && (
        <PhotoViewer
          photos={photos}
          index={activeIndex}
          onIndexChange={setActiveIndex}
          onClose={() => setActiveIndex(null)}
          mode="story"
        />
      )}
    </>
  )
}
