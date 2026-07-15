import { memo, useState } from 'react'
import type { PhotoData } from '../firebase/photos'
import type { ReactionType, TemplateId } from '../types'
import { optimizedImageUrl } from '../utils/cloudinary'
import { WALL_TEXT_MAX } from '../utils/validation'
import { Avatar } from './Avatar'
import { IconPin, IconX } from './Icons'
import { ProgressiveImage } from './ProgressiveImage'
import { ReactionPicker } from './ReactionPicker'
import { RepliesList } from './RepliesList'
import { ReportButton } from './ReportButton'
import { ThemeSeal } from './ThemeSeal'

interface Props {
  photo: PhotoData
  isOrg: boolean
  onOpen: (photo: PhotoData) => void
  onDelete?: (photoId: string) => void
  onPin?: (photo: PhotoData) => void
  templateId?: TemplateId
  eventId: string
  eventName: string
  // Reacciones/respuestas — mismo sistema que los mensajes del muro (ver
  // ReactionPicker/RepliesList, ambos genéricos y ya usados ahí). La
  // identidad del autor (nombre/token/rol) vive en el closure de
  // onReact/onReply del padre — mismo patrón que ya usa el mensaje del muro
  // en EventWall.tsx (handleReact/handleReply no reciben identidad como
  // parámetro, la toman de su propio scope) — esta card solo necesita
  // `myToken` para que ReactionPicker sepa cuál es "mi" reacción. Todas
  // opcionales porque WallSection.tsx no siempre tiene una identidad
  // resuelta antes de que el visitante confirme su nombre; sin ellas la
  // card muestra el conteo pero no permite interactuar.
  myToken?: string
  canReply?: boolean
  onReact?: (photo: PhotoData, type: ReactionType | null) => void
  onReply?: (photo: PhotoData, text: string) => void | Promise<void>
}

// Misma "forma" que una card de mensaje del muro (mismo padding/borde/avatar)
// para que una foto se sienta como un comentario más del feed, no como un
// bloque distinto. La imagen usa object-cover con altura acotada — un
// preview recortado tipo feed; el encuadre completo se ve al abrir PhotoViewer.
// El destacado (pin) usa el mismo tratamiento visual que un mensaje fijado
// (borde/resplandor dorado + ThemeSeal) — antes las fotos no tenían `pinned`
// en absoluto (ni el campo en Firestore ni este botón), así que no se podían
// fijar aunque el organizador sí podía fijar comentarios de texto.
// memo: sin esto, cada card se re-renderizaba junto con TODO el feed en
// cada tecla escrita en el compositor del padre (EventWall.tsx/
// WallSection.tsx) — ver también WallMessageCard.tsx, mismo motivo. Los
// handlers que recibe (onOpen/onDelete/onPin/onReact/onReply) ahora están
// estabilizados con useCallback en ambos padres para que este memo no quede
// anulado igual que antes.
export const PhotoFeedCard = memo(function PhotoFeedCard({
  photo,
  isOrg,
  onOpen,
  onDelete,
  onPin,
  templateId,
  eventId,
  eventName,
  myToken,
  canReply,
  onReact,
  onReply,
}: Props) {
  // Estado de respuesta local a esta card (no se levanta al padre, a
  // diferencia del mensaje del muro en EventWall.tsx) — cada foto ya es
  // independiente en el feed, así que no hace falta un "replyingTo" global.
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  async function handleSendReply() {
    if (!onReply || !replyText.trim() || sendingReply) return
    setSendingReply(true)
    setReplyError('')
    try {
      await onReply(photo, replyText)
      setReplyText('')
      setReplying(false)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'No se pudo enviar la respuesta. Intenta de nuevo.')
    } finally {
      setSendingReply(false)
    }
  }

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

      <button type="button" onClick={() => onOpen(photo)} className="block rounded-lg overflow-hidden ml-9 w-[calc(100%-2.25rem)]">
        <ProgressiveImage
          src={optimizedImageUrl(photo.url, 600)}
          alt={photo.caption || `Foto de ${photo.authorName}`}
          width={photo.width}
          height={photo.height}
          fallbackAspectRatio={4 / 5}
          className="w-full max-h-[420px]"
          imgClassName="object-cover cursor-pointer"
        />
      </button>

      {photo.caption && (
        <p className="text-sm mt-2 ml-9 text-[var(--invite-text)]">{photo.caption}</p>
      )}

      <div className="mt-2">
        <RepliesList replies={photo.replies} />

        {/* Misma fila/alineación que la card de mensaje del muro (ver
            EventWall.tsx): ReactionPicker + "Responder" + acciones de
            organizador/reporte. */}
        <div className="flex items-center gap-3 flex-wrap ml-[1.625rem]">
          {myToken && onReact && (
            <ReactionPicker
              reactions={photo.reactions}
              myToken={myToken}
              onReact={(type) => onReact(photo, type)}
            />
          )}
          {canReply && onReply && !replying && (
            <button onClick={() => setReplying(true)} className="wall-action-btn text-xs text-gray-400 hover:text-primary">
              Responder
            </button>
          )}
          {isOrg && onDelete && (
            <button
              onClick={() => onDelete(photo.id)}
              className="wall-action-btn text-xs text-red-400 hover:text-red-300"
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
            className="wall-action-btn text-xs text-gray-400 hover:text-red-500 transition-colors"
            showLabel
          />
        </div>

        {canReply && onReply && replying && (
          <div className="mt-3 flex gap-2 ml-9">
            <input
              type="text"
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="Escribe tu respuesta…"
              maxLength={WALL_TEXT_MAX}
              autoFocus
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-transparent text-[var(--invite-text)]"
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendReply() }}
            />
            <button onClick={handleSendReply} disabled={sendingReply} className="bg-primary text-white rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50">
              Enviar
            </button>
            <button onClick={() => { setReplying(false); setReplyError('') }} aria-label="Cancelar respuesta" className="flex items-center text-gray-400 hover:text-gray-600">
              <IconX className="w-4 h-4" />
            </button>
          </div>
        )}
        {replyError && <p className="text-xs text-red-500 mt-1 ml-9">{replyError}</p>}
      </div>
    </div>
  )
})
