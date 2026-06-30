import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getEvent } from '../firebase/events'
import {
  deleteWallMessage,
  dislikeWallMessage,
  getOlderWallMessages,
  likeWallMessage,
  pinWallMessage,
  postWallMessage,
  replyToWallMessage,
  subscribeToWall,
} from '../firebase/wall'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { optimizedImageUrl } from '../utils/cloudinary'
import { WALL_NAME_MAX, WALL_TEXT_MAX } from '../utils/validation'
import {
  IconCrown,
  IconHelpCircle,
  IconLightbulb,
  IconMessageSquare,
  IconMusic,
  IconPin,
  IconThumbsDown,
  IconThumbsUp,
  IconX,
} from '../components/Icons'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ThemeSeal } from '../components/ThemeSeal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import type { EventData, WallMessage, WallMessageType } from '../types'

interface TypeConfig {
  label: string
  Icon: ({ className }: { className?: string }) => React.ReactElement
  color: string
}

const TYPE_CONFIG: Record<WallMessageType, TypeConfig> = {
  comment:  { label: 'Comentario', Icon: IconMessageSquare, color: 'bg-blue-100 text-blue-700' },
  question: { label: 'Pregunta',   Icon: IconHelpCircle,    color: 'bg-yellow-100 text-yellow-700' },
  music:    { label: 'Música',     Icon: IconMusic,          color: 'bg-purple-100 text-purple-700' },
  idea:     { label: 'Idea',       Icon: IconLightbulb,      color: 'bg-green-100 text-green-700' },
}

const GUEST_NAME_KEY  = 'wall_guest_name'
const DEVICE_TOKEN_KEY = 'wall_device_token'

function getDeviceToken(): string {
  let token = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!token) {
    token = crypto.randomUUID()
    localStorage.setItem(DEVICE_TOKEN_KEY, token)
  }
  return token
}

function getAge(birthDate: string): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

/* Nombre que se guarda en Firestore para el anfitrión */
const OWNER_DISPLAY = 'Anfitrión'

export function EventWall() {
  const { id }    = useParams<{ id: string }>()
  const { user }  = useAuth()
  const { profile } = useUserProfile()
  const [event, setEvent]           = useState<EventData | null>(null)
  const [messages, setMessages]     = useState<WallMessage[]>([])
  const [loading, setLoading]       = useState(true)
  const [wallError, setWallError]   = useState('')
  const [olderMessages, setOlderMessages] = useState<WallMessage[]>([])
  const [loadingOlder, setLoadingOlder]   = useState(false)
  const [hasMoreOlder, setHasMoreOlder]   = useState(true)
  const [olderError, setOlderError]       = useState('')
  const [guestName, setGuestName]   = useState(() => localStorage.getItem(GUEST_NAME_KEY) || '')
  const [nameConfirmed, setNameConfirmed] = useState(() => !!localStorage.getItem(GUEST_NAME_KEY) || !!localStorage.getItem('firebase:authUser'))
  const [text, setText]             = useState('')
  const [type, setType]             = useState<WallMessageType>('comment')
  const [posting, setPosting]       = useState(false)
  const [postError, setPostError]   = useState('')
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText]   = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOwner    = !!(user && event && user.uid === event.ownerId)
  const isPremium  = event?.plan === 'premium'
  const isMinor    = profile?.birthDate ? getAge(profile.birthDate) < 18 : false

  // If user is authenticated, skip name screen. Igual que en EventJoin: profile
  // llega async después de user, y el guard `!guestName` evita pisar lo que el
  // usuario ya escribió.
  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    if (user) {
      setNameConfirmed(true)
      if (!guestName) {
        const name = profile?.displayName || user.displayName || ''
        if (name) setGuestName(name)
      }
    }
  }, [user, profile])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  useEffect(() => {
    if (!id) return
    getEvent(id).then(setEvent)
    const unsub = subscribeToWall(id, (msgs) => {
      setMessages(msgs)
      setLoading(false)
    }, (err) => {
      console.error('Error loading event wall:', err)
      setWallError('No se pudieron cargar los mensajes del muro. Verifica tu conexión.')
      setLoading(false)
    })
    return unsub
  }, [id])

  async function handleLoadOlder() {
    if (!id || loadingOlder) return
    setLoadingOlder(true)
    setOlderError('')
    try {
      const allLoaded = [...messages, ...olderMessages]
      const oldest = allLoaded.length > 0 ? Math.min(...allLoaded.map((m) => m.createdAt)) : Date.now()
      const { messages: older, hasMore } = await getOlderWallMessages(id, oldest)
      setOlderMessages((prev) => [...prev, ...older])
      setHasMoreOlder(hasMore)
    } catch (err) {
      console.error('Error loading older wall messages:', err)
      setOlderError('No se pudieron cargar mensajes anteriores. Intenta de nuevo.')
    } finally {
      setLoadingOlder(false)
    }
  }

  function confirmName(e: React.FormEvent) {
    e.preventDefault()
    if (!guestName.trim()) return
    localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
    setNameConfirmed(true)
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !text.trim() || isMinor) return
    setPosting(true)
    setPostError('')
    try {
      const authorName  = isOwner ? OWNER_DISPLAY : (user ? (profile?.displayName || user.displayName || guestName) : guestName)
      const authorToken = isOwner ? (user?.uid ?? 'owner') : (user ? user.uid : (localStorage.getItem(GUEST_NAME_KEY) || guestName))
      const authorRole  = isOwner ? 'owner' : 'guest'
      const authorPhotoURL = isOwner ? undefined : (user ? (profile?.photoURL || user.photoURL || undefined) : undefined)
      await postWallMessage(id, text, type, authorName, authorToken, authorRole, authorPhotoURL)
      setText('')
      textareaRef.current?.focus()
    } catch (err) {
      console.error('Error posting wall message:', err)
      setPostError(err instanceof Error ? err.message : 'No se pudo publicar el mensaje. Intenta de nuevo.')
    } finally {
      setPosting(false)
    }
  }

  async function handleReply(message: WallMessage) {
    if (!id || !replyText.trim()) return
    try {
      await replyToWallMessage(id, message.id, replyText, message.replies)
      setReplyText('')
      setReplyingTo(null)
    } catch (err) {
      console.error('Error replying to wall message:', err)
      setPostError(err instanceof Error ? err.message : 'No se pudo enviar la respuesta. Intenta de nuevo.')
    }
  }

  async function confirmDeleteMessage() {
    if (!id || !deletingMessageId) return
    await deleteWallMessage(id, deletingMessageId)
    setDeletingMessageId(null)
  }

  async function handlePin(msg: WallMessage) {
    if (!id) return
    await pinWallMessage(id, msg.id, msg.pinned)
  }

  async function handleLike(msg: WallMessage) {
    if (!id) return
    const token = getDeviceToken()
    await likeWallMessage(id, msg.id, token, msg.likedBy.includes(token))
  }

  async function handleDislike(msg: WallMessage) {
    if (!id) return
    const token = getDeviceToken()
    await dislikeWallMessage(id, msg.id, token, msg.dislikedBy.includes(token))
  }

  // Mensajes en vivo (recientes + destacados) + históricos cargados a pedido,
  // sin duplicar (un mensaje destacado viejo puede llegar por ambas vías).
  // Memoizado porque sin esto se reconstruía el Map y se reordenaba la lista
  // completa en cada render — incluido cada tecla escrita en el textarea del
  // formulario de post, que no tiene relación con `messages`/`olderMessages`.
  const sorted = useMemo(() => {
    const allMessagesById = new Map<string, WallMessage>()
    for (const m of messages) allMessagesById.set(m.id, m)
    for (const m of olderMessages) allMessagesById.set(m.id, m)

    /* Pinned first, then by date desc */
    return Array.from(allMessagesById.values()).sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      return b.createdAt - a.createdAt
    })
  }, [messages, olderMessages])

  if (!nameConfirmed && !isOwner && !user) {
    const nameGateContent = (
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
        <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
          {event?.name || 'Muro del evento'}
        </h1>
        <p className="text-sm text-gray-500 mb-4">¿Cómo te llamas para participar?</p>
        <form onSubmit={confirmName} className="space-y-3">
          <input
            type="text"
            required
            maxLength={WALL_NAME_MAX}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Tu nombre"
            autoFocus
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button type="submit" className="w-full bg-primary text-white rounded-lg py-2.5 text-sm font-semibold">
            Entrar al muro
          </button>
        </form>
      </div>
    )
    return event?.templateId === 'cowboy' || event?.templateId === 'graduation' ? (
      <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="min-h-screen flex items-center justify-center p-4">
        {nameGateContent}
      </InvitationThemeRoot>
    ) : (
      <div className="min-h-screen flex items-center justify-center p-4">{nameGateContent}</div>
    )
  }

  const postLabel = isOwner ? OWNER_DISPLAY : (user ? (profile?.displayName || user.displayName || guestName) : guestName)
  const postPhotoURL = isOwner ? undefined : (user ? (profile?.photoURL || user.photoURL || undefined) : undefined)

  const content = (
    <>
      {event?.coverImage && (
        <img src={optimizedImageUrl(event.coverImage, 800)} alt="" loading="lazy" className="w-full h-28 object-cover rounded-xl mb-4" />
      )}
      {isOwner && (
        <Link to={`/events/${id}`} className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1 mb-3">
          ← Volver a detalles
        </Link>
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{event?.name}</h1>
          <p className="text-xs text-gray-500">Muro del evento</p>
        </div>
        {!isOwner && !user && (
          <button
            onClick={() => { localStorage.removeItem(GUEST_NAME_KEY); setNameConfirmed(false) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cambiar nombre
          </button>
        )}
      </div>

      {/* Age restriction notice */}
      {user && isMinor && (
        <div className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          Solo puedes dar me gusta — los comentarios están disponibles para mayores de 18 años.
        </div>
      )}

      {/* Post form */}
      {!isMinor && (
        <form onSubmit={handlePost} className="invite-wall-form bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(TYPE_CONFIG) as WallMessageType[]).map((t) => {
              const cfg = TYPE_CONFIG[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex items-center gap-1 text-xs rounded-full px-3 py-1 font-medium transition-all ${
                    type === t ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}
                >
                  <cfg.Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-start gap-2">
            <Avatar name={postLabel} photoURL={postPhotoURL} size={28} />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Escribe tu ${TYPE_CONFIG[type].label.toLowerCase()}…`}
              rows={2}
              maxLength={WALL_TEXT_MAX}
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Como: <AuthorName name={postLabel} role={isOwner ? 'owner' : 'guest'} premium={isPremium} />
            </span>
            <span className="text-xs text-gray-400">{text.length}/{WALL_TEXT_MAX}</span>
            <button
              type="submit"
              disabled={posting || !text.trim()}
              className="bg-primary text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
            >
              {posting ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
          {postError && <p className="text-xs text-red-500">{postError}</p>}
        </form>
      )}

      {loading && <p className="text-center text-gray-400 text-sm">Cargando mensajes…</p>}

      {wallError && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-4">
          {wallError}
        </p>
      )}

      {!loading && !wallError && sorted.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {sorted.map((msg) => {
          const cfg       = TYPE_CONFIG[msg.type]
          const isOwnerMsg = msg.authorRole === 'owner'
          return (
            <div
              key={msg.id}
              data-pinned={msg.pinned}
              className={`invite-wall-message bg-white dark:bg-gray-800 rounded-xl border p-4 animate-fade-in-up transition-all ${
                msg.pinned
                  ? 'border-yellow-400/60 dark:border-yellow-500/40 shadow-[0_0_12px_rgba(232,184,75,.18)]'
                  : 'border-gray-200 dark:border-gray-700'
              }`}
            >
              {msg.pinned && <ThemeSeal templateId={event?.templateId} />}
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-start gap-2 flex-1 min-w-0">
                  <Avatar name={msg.authorName} photoURL={msg.authorPhotoURL} size={28} />
                  <div className="flex items-center gap-2 flex-wrap">
                    {msg.pinned && (
                      <span className="flex items-center gap-1 text-xs font-medium text-yellow-500">
                        <IconPin className="w-3 h-3" />
                        Destacado
                      </span>
                    )}
                    <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
                      <cfg.Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    <AuthorName name={msg.authorName} role={msg.authorRole} premium={isPremium && isOwnerMsg} />
                  </div>
                </div>
                {/* Owner actions */}
                {isOwner && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handlePin(msg)}
                      title={msg.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
                      aria-label={msg.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
                      className={`text-xs transition-colors ${msg.pinned ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`}
                    >
                      <IconPin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingMessageId(msg.id)}
                      className="text-xs text-red-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-900 dark:text-white mb-3 ml-9">{msg.text}</p>

              {/* Replies */}
              {msg.replies.length > 0 && (
                <div className="border-l-2 border-gray-100 dark:border-gray-700 pl-3 mb-3 space-y-2 ml-9">
                  {msg.replies.map((r) => (
                    <div key={r.id}>
                      <AuthorName name={OWNER_DISPLAY} role="owner" premium={isPremium} inline />
                      <span className="text-xs text-gray-700 dark:text-gray-300 ml-1">{r.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Reactions row */}
              <div className="flex items-center gap-3 ml-9">
                {(() => {
                  const token    = getDeviceToken()
                  const liked    = msg.likedBy.includes(token)
                  const disliked = msg.dislikedBy.includes(token)
                  return (
                    <>
                      <button
                        onClick={() => handleLike(msg)}
                        className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-primary font-medium' : 'text-gray-400 hover:text-primary'}`}
                      >
                        <IconThumbsUp className="w-3.5 h-3.5" />
                        {msg.likedBy.length > 0 && <span>{msg.likedBy.length}</span>}
                      </button>
                      <button
                        onClick={() => handleDislike(msg)}
                        className={`flex items-center gap-1 text-xs transition-colors ${disliked ? 'text-red-500 font-medium' : 'text-gray-400 hover:text-red-400'}`}
                      >
                        <IconThumbsDown className="w-3.5 h-3.5" />
                        {msg.dislikedBy.length > 0 && <span>{msg.dislikedBy.length}</span>}
                      </button>
                    </>
                  )
                })()}
                {isOwner && replyingTo !== msg.id && (
                  <button onClick={() => setReplyingTo(msg.id)} className="text-xs text-gray-400 hover:text-primary">
                    Responder
                  </button>
                )}
              </div>

              {/* Reply input */}
              {isOwner && replyingTo === msg.id && (
                <div className="mt-3 flex gap-2 ml-9">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe tu respuesta…"
                    maxLength={WALL_TEXT_MAX}
                    autoFocus
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleReply(msg) }}
                  />
                  <button onClick={() => handleReply(msg)} className="bg-primary text-white rounded-md px-3 py-1.5 text-xs font-medium">
                    Enviar
                  </button>
                  <button onClick={() => setReplyingTo(null)} aria-label="Cancelar respuesta" className="flex items-center text-gray-400 hover:text-gray-600">
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {!loading && !wallError && sorted.length > 0 && hasMoreOlder && (
        <div className="text-center mt-4">
          {olderError && <p className="text-xs text-red-500 mb-2">{olderError}</p>}
          <button
            onClick={handleLoadOlder}
            disabled={loadingOlder}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-50"
          >
            {loadingOlder ? 'Cargando…' : 'Cargar mensajes anteriores'}
          </button>
        </div>
      )}

      <ConfirmDialog
        open={!!deletingMessageId}
        title="Eliminar mensaje"
        message="¿Borrar este mensaje? No se puede deshacer."
        confirmLabel="Eliminar"
        danger
        onConfirm={confirmDeleteMessage}
        onCancel={() => setDeletingMessageId(null)}
      />
    </>
  )

  return event?.templateId === 'cowboy' || event?.templateId === 'graduation' ? (
    <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="max-w-xl mx-auto px-4 py-6 min-h-screen">
      {content}
    </InvitationThemeRoot>
  ) : (
    <div className="max-w-xl mx-auto px-4 py-6 min-h-screen">{content}</div>
  )
}

/* Avatar component */
function Avatar({ name, photoURL, size = 32 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return <img src={optimizedImageUrl(photoURL, size * 2)} alt={name} loading="lazy" className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-xs font-bold text-primary"
      style={{ width: size, height: size }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}

/* Componente para renderizar el nombre del autor con estilo según plan */
function AuthorName({
  name,
  role,
  premium,
  inline = false,
}: {
  name: string
  role: 'owner' | 'guest'
  premium: boolean
  inline?: boolean
}) {
  if (role !== 'owner') {
    return <span className={`text-xs font-semibold text-gray-700 dark:text-gray-300 ${inline ? 'inline' : ''}`}>{name}</span>
  }

  if (premium) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-bold ${inline ? '' : ''}`}
        style={{
          color: '#E8B84B',
          textShadow: '0 0 8px rgba(232,184,75,.8), 0 0 16px rgba(232,184,75,.4)',
        }}
      >
        <IconCrown className="w-3 h-3" />
        {name}
      </span>
    )
  }

  /* Basic plan — resaltar pero sin dorado */
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold text-primary ${inline ? '' : ''}`}>
      {name}
    </span>
  )
}
