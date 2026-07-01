import { useEffect, useState } from 'react'
import { fetchPhotos } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { optimizedImageUrl } from '../utils/cloudinary'
import { IconX, IconArrowLeft } from './Icons'

const MAX_STORIES = 20

interface Props {
  eventId: string
}

export function StoriesBar({ eventId }: Props) {
  const [photos, setPhotos] = useState<PhotoData[]>([])
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    fetchPhotos(eventId).then((all) => setPhotos(all.slice(0, MAX_STORIES)))
  }, [eventId])

  // Auto-advance story every 5s
  useEffect(() => {
    if (activeIndex === null) return
    setProgress(0)
    const start = Date.now()
    const duration = 5000
    const frame = requestAnimationFrame(function tick() {
      const elapsed = Date.now() - start
      const pct = Math.min(100, (elapsed / duration) * 100)
      setProgress(pct)
      if (pct < 100) {
        requestAnimationFrame(tick)
      } else {
        setActiveIndex((i) => {
          if (i === null) return null
          return i < photos.length - 1 ? i + 1 : null
        })
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [activeIndex, photos.length])

  useEffect(() => {
    if (activeIndex === null) return
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setActiveIndex(null)
      if (e.key === 'ArrowLeft') setActiveIndex((i) => Math.max(0, (i ?? 0) - 1))
      if (e.key === 'ArrowRight') {
        setActiveIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : null))
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [activeIndex, photos.length])

  if (photos.length === 0) return null

  const active = activeIndex !== null ? photos[activeIndex] : null

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

      {/* Full-screen story viewer */}
      {active && activeIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          {/* Progress bars */}
          <div className="flex gap-1 px-3 pt-safe pt-3">
            {photos.map((_, i) => (
              <div
                key={i}
                className="h-0.5 flex-1 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,.3)' }}
              >
                <div
                  className="h-full rounded-full transition-none"
                  style={{
                    background: '#fff',
                    width: i < activeIndex ? '100%' : i === activeIndex ? `${progress}%` : '0%',
                  }}
                />
              </div>
            ))}
          </div>

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2">
            <span className="text-white text-sm font-medium">{active.authorName}</span>
            <button
              onClick={() => setActiveIndex(null)}
              className="text-white/70 hover:text-white p-1"
              aria-label="Cerrar"
            >
              <IconX className="w-5 h-5" />
            </button>
          </div>

          {/* Image */}
          <div className="flex-1 relative flex items-center justify-center px-4">
            <img
              src={optimizedImageUrl(active.url, 800)}
              alt={active.caption || ''}
              className="max-h-full max-w-full rounded-xl object-contain"
            />

            {/* Tap zones: prev / next */}
            <button
              className="absolute left-0 top-0 w-1/3 h-full"
              onClick={() => setActiveIndex((i) => Math.max(0, (i ?? 0) - 1))}
              aria-label="Anterior"
            />
            <button
              className="absolute right-0 top-0 w-1/3 h-full"
              onClick={() => {
                setActiveIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : null))
              }}
              aria-label="Siguiente"
            />

            {/* Nav arrows (visible on desktop) */}
            {activeIndex > 0 && (
              <button
                className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => Math.max(0, (i ?? 0) - 1)) }}
              >
                <IconArrowLeft className="w-4 h-4" />
              </button>
            )}
            {activeIndex < photos.length - 1 && (
              <button
                className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white rotate-180"
                onClick={(e) => { e.stopPropagation(); setActiveIndex((i) => i !== null && i < photos.length - 1 ? i + 1 : null) }}
              >
                <IconArrowLeft className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Caption */}
          {active.caption && (
            <p className="text-white/80 text-sm text-center px-6 pb-safe pb-6">{active.caption}</p>
          )}
        </div>
      )}
    </>
  )
}
