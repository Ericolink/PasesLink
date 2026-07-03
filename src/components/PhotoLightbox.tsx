import { useEffect } from 'react'
import type { PhotoData } from '../firebase/photos'
import { optimizedImageUrl } from '../utils/cloudinary'
import { IconX, IconArrowLeft } from './Icons'

// Ancho de la versión servida en el lightbox: de sobra para el
// max-h-[70vh]/max-w-full de acá abajo incluso en pantallas retina, sin
// cargar el original completo (varios MB) por cada foto que el usuario mira
// — importante con eventos que acumulan cientos de fotos.
const LIGHTBOX_IMAGE_WIDTH = 1200

interface Props {
  photos: PhotoData[]
  index: number
  onClose: () => void
  onPrev: () => void
  onNext: () => void
  isOrg?: boolean
  onDelete?: (photoId: string) => void
}

export function PhotoLightbox({ photos, index, onClose, onPrev, onNext, isOrg, onDelete }: Props) {
  const photo = photos[index]

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onPrev()
      if (e.key === 'ArrowRight') onNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose, onPrev, onNext])

  if (!photo) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close */}
      <button
        className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full bg-black/40 transition-colors"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <IconX className="w-5 h-5" />
      </button>

      {/* Prev */}
      {index > 0 && (
        <button
          className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 transition-colors"
          onClick={(e) => { e.stopPropagation(); onPrev() }}
          aria-label="Anterior"
        >
          <IconArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Next */}
      {index < photos.length - 1 && (
        <button
          className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 transition-colors rotate-180"
          onClick={(e) => { e.stopPropagation(); onNext() }}
          aria-label="Siguiente"
        >
          <IconArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Image */}
      <div
        className="max-w-2xl max-h-[80vh] mx-4 flex flex-col items-center gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={optimizedImageUrl(photo.url, LIGHTBOX_IMAGE_WIDTH)}
          alt={photo.caption || `Foto de ${photo.authorName}`}
          className="max-h-[70vh] max-w-full rounded-xl object-contain"
        />
        <div className="text-center">
          {photo.caption && (
            <p className="text-white text-sm mb-1">{photo.caption}</p>
          )}
          <p className="text-white/50 text-xs">{photo.authorName}</p>
          {isOrg && onDelete && (
            <button
              onClick={() => { onDelete(photo.id); onClose() }}
              className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
            >
              Eliminar foto
            </button>
          )}
        </div>
        <p className="text-white/30 text-xs">{index + 1} / {photos.length}</p>
      </div>
    </div>
  )
}
