import type { PhotoData } from '../firebase/photos'
import { optimizedImageUrl } from '../utils/cloudinary'
import { Avatar } from './Avatar'

interface Props {
  photo: PhotoData
  isOrg: boolean
  onOpen: () => void
  onDelete?: (photoId: string) => void
}

// Misma "forma" que una card de mensaje del muro (mismo padding/borde/avatar)
// para que una foto se sienta como un comentario más del feed, no como un
// bloque distinto. La imagen usa object-cover con altura acotada — un
// preview recortado tipo feed; el encuadre completo se ve al abrir PhotoViewer.
export function PhotoFeedCard({ photo, isOrg, onOpen, onDelete }: Props) {
  return (
    <div
      className="invite-wall-message border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
      style={{ borderColor: 'var(--invite-border)' }}
    >
      <div className="flex items-start gap-2 mb-3">
        <Avatar name={photo.authorName} size={28} />
        <div className="flex-1 min-w-0">
          <span className="min-w-0 truncate text-xs font-semibold text-[var(--invite-text)] block">{photo.authorName}</span>
          <span className="text-[11px] text-[var(--invite-text-muted)]">Compartió una foto</span>
        </div>
      </div>

      <button type="button" onClick={onOpen} className="block rounded-lg overflow-hidden ml-9 w-[calc(100%-2.25rem)]">
        <img
          src={optimizedImageUrl(photo.url, 600)}
          alt={photo.caption || `Foto de ${photo.authorName}`}
          className="w-full max-h-[420px] object-cover cursor-pointer"
          loading="lazy"
        />
      </button>

      {photo.caption && (
        <p className="text-sm mt-2 ml-9 text-[var(--invite-text)]">{photo.caption}</p>
      )}

      {isOrg && onDelete && (
        <button
          onClick={() => onDelete(photo.id)}
          className="text-xs text-red-400 hover:text-red-300 mt-2 ml-9"
        >
          Eliminar foto
        </button>
      )}
    </div>
  )
}
