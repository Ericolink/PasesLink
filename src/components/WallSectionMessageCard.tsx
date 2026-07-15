import { memo } from 'react'
import type { ReactionType, TemplateId, WallMessage } from '../types'
import { WALL_TYPE_CONFIG } from '../utils/wallMessageTypes'
import { Avatar } from './Avatar'
import { IconCrown } from './Icons'
import { ReactionPicker } from './ReactionPicker'
import { ReportButton } from './ReportButton'
import { ThemeSeal } from './ThemeSeal'

interface Props {
  message: WallMessage
  templateId?: TemplateId
  eventId: string
  eventName: string
  myToken: string
  onReact: (message: WallMessage, type: ReactionType | null) => void
}

// Extraído de lo que antes era JSX inline dentro de feed.map() en
// WallSection.tsx — memoizado (React.memo). Versión simple del mensaje del
// muro: sin respuestas ni acciones de organizador (este widget embebido
// solo las tiene para fotos, ver PhotoFeedCard). Sin esto, escribir en el
// compositor de posts (arriba, en el mismo componente que este feed)
// re-renderizaba cada mensaje visible en cada tecla.
export const WallSectionMessageCard = memo(function WallSectionMessageCard({
  message,
  templateId,
  eventId,
  eventName,
  myToken,
  onReact,
}: Props) {
  const cfg = WALL_TYPE_CONFIG[message.type]
  const isOwnerMsg = message.authorRole === 'owner'

  return (
    <div
      data-pinned={message.pinned}
      className="invite-wall-message border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
      style={{ borderColor: message.pinned ? '#facc15' : 'var(--invite-border)' }}
    >
      {message.pinned && <ThemeSeal templateId={templateId} />}
      <div className="flex items-start gap-2 mb-2">
        <Avatar name={message.authorName} photoURL={message.authorPhotoURL} size={28} />
        <div className="flex-1 min-w-0">
          {/* Sin flex-wrap a propósito: con un nombre muy largo, el
              badge de tipo y "Destacado" (tamaño fijo, shrink-0)
              nunca se aplastan ni saltan de línea — el nombre es lo
              único que cede espacio, con ellipsis prolijo en vez de
              un wrap tosco en pantallas angostas. */}
          <div className="flex items-center gap-2 min-w-0">
            <span className={`shrink-0 flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
              <cfg.Icon className="w-3 h-3" />
              {cfg.label}
            </span>
            {message.pinned && (
              <span className="invite-pin-label hidden shrink-0 text-[10px] uppercase tracking-wide font-bold rounded-full px-2 py-0.5 bg-[var(--invite-accent)] text-white">
                Destacado
              </span>
            )}
            {isOwnerMsg
              ? <span className="min-w-0 inline-flex items-center gap-1 text-xs font-bold"
                  style={{ color: '#E8B84B', textShadow: '0 0 8px rgba(232,184,75,.8)' }}>
                  <IconCrown className="w-3 h-3 shrink-0" /><span className="min-w-0 truncate">{message.authorName}</span>
                </span>
              : <span className="min-w-0 truncate text-xs font-semibold text-[var(--invite-text)]">{message.authorName}</span>
            }
          </div>
        </div>
      </div>
      <p className="text-sm mb-3 ml-9 text-[var(--invite-text)]">{message.text}</p>
      <div className="flex items-center gap-1 ml-[1.625rem]">
        {/* ml-9 (36px) del texto de arriba menos el padding nuevo del
            botón (p-2.5 = 10px) mantiene el ícono alineado con el
            resto del bloque — el padding deja el target táctil real
            en ~40px+ (antes el botón era solo el ícono de 14px,
            imposible de tocar con precisión en celular). */}
        <ReactionPicker
          reactions={message.reactions}
          myToken={myToken}
          onReact={(type) => onReact(message, type)}
        />
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
    </div>
  )
})
