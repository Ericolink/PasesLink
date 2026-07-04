import type { PhotoData } from '../firebase/photos'
import type { TemplateId } from '../types'
import { optimizedImageUrl } from '../utils/cloudinary'
import { Avatar } from './Avatar'
import { IconPin } from './Icons'
import { ProgressiveImage } from './ProgressiveImage'
import { ReportButton } from './ReportButton'
import { ThemeSeal } from './ThemeSeal'

interface Props {
  photo: PhotoData
  isOrg: boolean
  onOpen: () => void
  onDelete?: (photoId: string) => void
  onPin?: (photo: PhotoData) => void
  templateId?: TemplateId
  eventId: string
  eventName: string
}

// Misma "forma" que una card de mensaje del muro (mismo padding/borde/avatar)
// para que una foto se sienta como un comentario más del feed, no como un
// bloque distinto. La imagen usa object-cover con altura acotada — un
// preview recortado tipo feed; el encuadre completo se ve al abrir PhotoViewer.
// El destacado (pin) usa el mismo tratamiento visual que un mensaje fijado
// (borde/resplandor dorado + ThemeSeal) — antes las fotos no tenían `pinned`
// en absoluto (ni el campo en Firestore ni este botón), así que no se podían
// fijar aunque el organizador sí podía fijar comentarios de texto.
export function PhotoFeedCard({ photo, isOrg, onOpen, onDelete, onPin, templateId, eventId, eventName }: Props) {
  return (
    <div
      className={`invite-wall-message border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)] transition-all ${
        photo.pinned ? 'shadow-[0_0_12px_rgba(232,184,75,.18)]' : ''
      }`}
      style={{ borderColor: photo.pinned ? '#E8B84B' : 'var(--invite-border)' }}
    >
      {photo.pinned && <ThemeSeal templateId={templateId} />}
      <div className="flex items-start gap-2 mb-3">
        <Avatar name={photo.authorName} size={28} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="min-w-0 truncate text-xs font-semibold text-[var(--invite-text)]">{photo.authorName}</span>
            {photo.pinned && (
              <span className="shrink-0 text-[10px] uppercase tracking-wide font-bold rounded-full px-2 py-0.5 bg-[var(--invite-accent)] text-white">
                Destacado
              </span>
            )}
          </div>
          <span className="text-[11px] text-[var(--invite-text-muted)]">Compartió una foto</span>
        </div>
        {isOrg && onPin && (
          <button
            onClick={() => onPin(photo)}
            title={photo.pinned ? 'Quitar destacado' : 'Destacar foto'}
            aria-label={photo.pinned ? 'Quitar destacado' : 'Destacar foto'}
            className={`p-2.5 -mr-2 -mt-1 shrink-0 transition-colors ${photo.pinned ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`}
          >
            <IconPin className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <button type="button" onClick={onOpen} className="block rounded-lg overflow-hidden ml-9 w-[calc(100%-2.25rem)]">
        <ProgressiveImage
          src={optimizedImageUrl(photo.url, 600)}
          alt={photo.caption || `Foto de ${photo.authorName}`}
          width={photo.width}
          height={photo.height}
          className="w-full max-h-[420px]"
          imgClassName="object-cover cursor-pointer"
        />
      </button>

      {photo.caption && (
        <p className="text-sm mt-2 ml-9 text-[var(--invite-text)]">{photo.caption}</p>
      )}

      <div className="flex items-center gap-3 mt-2 ml-9">
        {isOrg && onDelete && (
          <button
            onClick={() => onDelete(photo.id)}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Eliminar foto
          </button>
        )}
        <ReportButton
          eventId={eventId}
          eventName={eventName}
          contentType="photo"
          contentId={photo.id}
          contentSnapshot={photo.url}
          contentCaption={photo.caption}
          contentAuthorName={photo.authorName}
          contentAuthorToken={photo.authorToken}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-500 transition-colors"
          showLabel
        />
      </div>
    </div>
  )
}
