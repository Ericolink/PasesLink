import { memo, useState } from 'react'
import type { ReactionType, TemplateId, WallMessage } from '../types'
import { WALL_TEXT_MAX } from '../utils/validation'
import { WALL_TYPE_CONFIG } from '../utils/wallMessageTypes'
import { Avatar } from './Avatar'
import { AuthorName } from './AuthorName'
import { FieldError } from './FieldError'
import { IconPin, IconX } from './Icons'
import { ReactionPicker } from './ReactionPicker'
import { RepliesList } from './RepliesList'
import { ReportButton } from './ReportButton'
import { ThemeSeal } from './ThemeSeal'

interface Props {
  message: WallMessage
  isOrg: boolean
  // uid del visitante actual (o undefined sin sesión) — para el botón de
  // autoborrado, que solo firestore.rules puede verificar cuando hay una
  // identidad de Firebase Auth detrás (ver el comentario original en
  // EventWall.tsx: un invitado sin cuenta no tiene forma de probar autoría
  // del lado servidor).
  currentUserUid?: string
  canReply: boolean
  templateId?: TemplateId
  eventId: string
  eventName: string
  myToken: string
  onPin: (message: WallMessage) => void
  onRequestDelete: (messageId: string) => void
  onReact: (message: WallMessage, type: ReactionType | null) => void
  onReply: (message: WallMessage, text: string) => Promise<void>
}

// Extraído de lo que antes era JSX inline dentro de feed.map() en
// EventWall.tsx — memoizado (React.memo) y con el estado de respuesta LOCAL
// a la card (mismo patrón que ya usaba PhotoFeedCard, no levantado al
// padre): antes `replyText` vivía en EventWall junto a TODO el feed, así
// que cada tecla escrita en la respuesta a un mensaje re-renderizaba cada
// card visible del muro, no solo la que se estaba respondiendo. Con el
// estado acá adentro y props estables (ver EventWall.tsx), escribir una
// respuesta ya no toca a las demás cards.
export const WallMessageCard = memo(function WallMessageCard({
  message,
  isOrg,
  currentUserUid,
  canReply,
  templateId,
  eventId,
  eventName,
  myToken,
  onPin,
  onRequestDelete,
  onReact,
  onReply,
}: Props) {
  const [replying, setReplying] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replyError, setReplyError] = useState('')
  const [sendingReply, setSendingReply] = useState(false)

  async function handleSendReply() {
    if (!replyText.trim() || sendingReply) return
    setSendingReply(true)
    setReplyError('')
    try {
      await onReply(message, replyText)
      setReplyText('')
      setReplying(false)
    } catch (err) {
      setReplyError(err instanceof Error ? err.message : 'No se pudo enviar la respuesta. Intenta de nuevo.')
    } finally {
      setSendingReply(false)
    }
  }

  const cfg = WALL_TYPE_CONFIG[message.type]
  const canSelfDelete = !isOrg && !!currentUserUid && message.authorToken === currentUserUid

  return (
    <div
      data-pinned={message.pinned}
      className={`invite-wall-message bg-white dark:bg-gray-800 rounded-xl border p-4 animate-fade-in-up transition-all ${
        message.pinned
          ? 'border-yellow-400/60 dark:border-yellow-500/40 shadow-[0_0_12px_rgba(232,184,75,.18)]'
          : 'border-gray-200 dark:border-gray-700'
      }`}
    >
      {message.pinned && <ThemeSeal templateId={templateId} />}
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-start gap-2 flex-1 min-w-0">
          <Avatar name={message.authorName} photoURL={message.authorPhotoURL} size={28} />
          <div className="flex items-center gap-2 flex-wrap">
            {message.pinned && (
              <span className="flex items-center gap-1 text-xs font-medium text-yellow-500">
                <IconPin className="w-3 h-3" />
                Destacado
              </span>
            )}
            <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
              <cfg.Icon className="w-3 h-3" />
              {cfg.label}
            </span>
            <AuthorName name={message.authorName} role={message.authorRole} />
          </div>
        </div>
        {/* Owner/co-org actions */}
        {isOrg && (
          <div className="flex items-center -mr-2 shrink-0">
            <button
              onClick={() => onPin(message)}
              title={message.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
              aria-label={message.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
              className={`p-2.5 transition-colors ${message.pinned ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`}
            >
              <IconPin className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onRequestDelete(message.id)}
              aria-label="Eliminar mensaje"
              className="wall-action-btn text-xs text-red-400 hover:text-red-600"
            >
              Eliminar
            </button>
          </div>
        )}
        {canSelfDelete && (
          <button
            onClick={() => onRequestDelete(message.id)}
            aria-label="Eliminar mensaje"
            className="wall-action-btn text-xs text-red-400 hover:text-red-600 shrink-0"
          >
            Eliminar
          </button>
        )}
      </div>

      <p className="text-sm text-gray-900 dark:text-white mb-3 ml-9">{message.text}</p>

      {/* Replies */}
      <RepliesList replies={message.replies} />

      {/* Reactions row — padding del botón deja el target táctil real
          en ~40px+ (antes el botón era solo el ícono de 14px,
          imposible de tocar con precisión en celular); ml-[1.625rem]
          = ml-9 (36px) menos el padding nuevo (p-2.5 = 10px), para
          que el ícono siga alineado con el resto del bloque. */}
      <div className="flex items-center gap-1 ml-[1.625rem]">
        <ReactionPicker
          reactions={message.reactions}
          myToken={myToken}
          onReact={(type) => onReact(message, type)}
        />
        {canReply && !replying && (
          <button onClick={() => setReplying(true)} className="wall-action-btn text-xs text-gray-400 hover:text-primary">
            Responder
          </button>
        )}
        <ReportButton
          eventId={eventId}
          eventName={eventName}
          contentType="comment"
          contentId={message.id}
          contentSnapshot={message.text}
          contentAuthorName={message.authorName}
          contentAuthorToken={message.authorToken}
        />
      </div>

      {/* Reply input */}
      {canReply && replying && (
        <div className="mt-3 flex gap-2 ml-9">
          {/* onFocus + scrollIntoView: este input vive dentro de una
              lista larga de mensajes — sin esto, el teclado podía
              taparlo (o tapar el botón "Enviar") si no quedaba
              suficiente margen de scroll debajo de su posición
              natural en la página. */}
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Escribe tu respuesta…"
            maxLength={WALL_TEXT_MAX}
            autoFocus
            onFocus={(e) => e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'center' })}
            className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
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
      <FieldError message={replyError} className="mt-1 ml-9" />
    </div>
  )
})
