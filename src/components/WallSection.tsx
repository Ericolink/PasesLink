import React, { useEffect, useRef, useState } from 'react'
import { likeWallMessage, dislikeWallMessage, postWallMessage, subscribeToWall } from '../firebase/wall'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { optimizedImageUrl } from '../utils/cloudinary'
import { IconThumbsUp, IconThumbsDown, IconMessageSquare, IconHelpCircle, IconMusic, IconLightbulb, IconCrown } from './Icons'
import { WALL_TEXT_MAX } from '../utils/validation'
import type { WallMessage, WallMessageType } from '../types'

const DEVICE_TOKEN_KEY = 'wall_device_token'
const GUEST_NAME_KEY   = 'wall_guest_name'
// Widget embebido (preview), no la vista principal del muro: alcanza con los
// mensajes más recientes, sin paginación de historial — ver EventWall.tsx
// para la vista completa con "Cargar mensajes anteriores".
const WALL_SECTION_LIVE_LIMIT = 20

function getDeviceToken() {
  let t = localStorage.getItem(DEVICE_TOKEN_KEY)
  if (!t) { t = crypto.randomUUID(); localStorage.setItem(DEVICE_TOKEN_KEY, t) }
  return t
}

function getAge(birthDate: string): number {
  const [y, m, d] = birthDate.split('-').map(Number)
  const today = new Date()
  let age = today.getFullYear() - y
  if (today.getMonth() + 1 < m || (today.getMonth() + 1 === m && today.getDate() < d)) age--
  return age
}

const TYPE_CONFIG: Record<WallMessageType, { label: string; Icon: React.FC<{className?:string}>; color: string }> = {
  comment:  { label: 'Comentario', Icon: IconMessageSquare, color: 'bg-blue-100 text-blue-700' },
  question: { label: 'Pregunta',   Icon: IconHelpCircle,    color: 'bg-yellow-100 text-yellow-700' },
  music:    { label: 'Música',     Icon: IconMusic,          color: 'bg-purple-100 text-purple-700' },
  idea:     { label: 'Idea',       Icon: IconLightbulb,      color: 'bg-green-100 text-green-700' },
}

interface Props { eventId: string; isPremium?: boolean; guestName?: string }

export function WallSection({ eventId, isPremium = false, guestName: guestNameProp }: Props) {
  const { user }          = useAuth()
  const { profile }       = useUserProfile()
  const [messages, setMessages] = useState<WallMessage[]>([])
  const [loading, setLoading]   = useState(true)
  const [wallError, setWallError] = useState('')
  const [text, setText]         = useState('')
  const [type, setType]         = useState<WallMessageType>('comment')
  const [posting, setPosting]   = useState(false)
  const [postError, setPostError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isMinor = profile?.birthDate ? getAge(profile.birthDate) < 18 : false

  // Name resolution: prop → localStorage → empty
  const resolvedGuestName = guestNameProp || localStorage.getItem(GUEST_NAME_KEY) || ''
  const authorName  = user ? (profile?.displayName || user.displayName || 'Anfitrión') : resolvedGuestName
  const authorPhoto = user ? (profile?.photoURL || user.photoURL || undefined) : undefined

  useEffect(() => {
    const unsub = subscribeToWall(eventId, (msgs) => {
      setMessages(msgs.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.createdAt - a.createdAt
      }))
      setLoading(false)
    }, (err) => {
      console.error('Error loading wall section:', err)
      setWallError('No se pudieron cargar los mensajes del muro.')
      setLoading(false)
    }, WALL_SECTION_LIVE_LIMIT)
    return unsub
  }, [eventId])

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || isMinor) return
    setPosting(true)
    setPostError('')
    try {
      const token = user ? user.uid : (resolvedGuestName || crypto.randomUUID())
      await postWallMessage(eventId, text, type, authorName, token, 'guest', authorPhoto)
      setText('')
      textareaRef.current?.focus()
    } catch (err) {
      console.error('Error posting wall message:', err)
      setPostError(err instanceof Error ? err.message : 'No se pudo publicar el mensaje. Intenta de nuevo.')
    } finally {
      setPosting(false)
    }
  }

  async function handleLike(msg: WallMessage) {
    const token = getDeviceToken()
    await likeWallMessage(eventId, msg.id, token, msg.likedBy.includes(token))
  }

  async function handleDislike(msg: WallMessage) {
    const token = getDeviceToken()
    await dislikeWallMessage(eventId, msg.id, token, msg.dislikedBy.includes(token))
  }

  const canPost = user ? !isMinor : !!resolvedGuestName

  return (
    <div className="invite-wall-section relative mt-8 pt-6 border-t" style={{ borderColor: 'var(--invite-border)' }}>
      <h2 className="text-lg font-bold mb-4 text-[var(--invite-text)]">Muro del evento</h2>

      {/* Age restriction notice */}
      {user && isMinor && (
        <div className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          Solo puedes dar me gusta — los comentarios están disponibles para mayores de 18 años.
        </div>
      )}

      {/* Post form */}
      {canPost && (
        <form
          onSubmit={handlePost}
          className="invite-wall-form border p-4 mb-4 space-y-3 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
          style={{ borderColor: 'var(--invite-border)' }}
        >
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(TYPE_CONFIG) as WallMessageType[]).map((t) => {
              const cfg = TYPE_CONFIG[t]
              return (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`flex items-center gap-1 text-xs rounded-full px-3 py-1 font-medium transition-all ${
                    type === t ? cfg.color + ' ring-2 ring-offset-1 ring-current' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                  }`}>
                  <cfg.Icon className="w-3 h-3" />
                  {cfg.label}
                </button>
              )
            })}
          </div>
          <div className="flex items-start gap-2">
            <Avatar name={authorName} photoURL={authorPhoto} size={28} />
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Escribe tu ${TYPE_CONFIG[type].label.toLowerCase()}...`}
              rows={2}
              maxLength={WALL_TEXT_MAX}
              className="flex-1 border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 bg-transparent text-[var(--invite-text)] focus:ring-[var(--invite-accent)]"
              style={{ borderColor: 'var(--invite-border)' }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--invite-text-muted)]">Como: <strong>{authorName}</strong></span>
            <span className="text-xs text-[var(--invite-text-muted)]">{text.length}/{WALL_TEXT_MAX}</span>
            <button type="submit" disabled={posting || !text.trim()}
              className="text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 bg-[var(--invite-accent)]">
              {posting ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
          {postError && <p className="text-xs text-red-500">{postError}</p>}
        </form>
      )}

      {loading && <p className="text-center text-sm py-4 text-[var(--invite-text-muted)]">Cargando mensajes...</p>}
      {wallError && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-3">
          {wallError}
        </p>
      )}
      {!loading && !wallError && messages.length === 0 && (
        <p className="text-center text-sm py-6 text-[var(--invite-text-muted)]">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {messages.map((msg) => {
          const cfg       = TYPE_CONFIG[msg.type]
          const isOwnerMsg = msg.authorRole === 'owner'
          const token     = getDeviceToken()
          const liked     = msg.likedBy.includes(token)
          const disliked  = msg.dislikedBy.includes(token)
          return (
            <div key={msg.id}
              data-pinned={msg.pinned}
              className="invite-wall-message border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
              style={{ borderColor: msg.pinned ? '#facc15' : 'var(--invite-border)' }}>
              <div className="flex items-start gap-2 mb-2">
                <Avatar name={msg.authorName} photoURL={msg.authorPhotoURL} size={28} />
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
                    {msg.pinned && (
                      <span className="invite-pin-label hidden shrink-0 text-[10px] uppercase tracking-wide font-bold rounded-full px-2 py-0.5 bg-[var(--invite-accent)] text-white">
                        Destacado
                      </span>
                    )}
                    {isOwnerMsg && isPremium
                      ? <span className="min-w-0 inline-flex items-center gap-1 text-xs font-bold"
                          style={{ color: '#FAEF5D', textShadow: '0 0 8px rgba(250,239,93,.8)' }}>
                          <IconCrown className="w-3 h-3 shrink-0" /><span className="min-w-0 truncate">{msg.authorName}</span>
                        </span>
                      : isOwnerMsg
                        ? <span className="min-w-0 truncate text-xs font-bold text-[var(--invite-accent)]">{msg.authorName}</span>
                        : <span className="min-w-0 truncate text-xs font-semibold text-[var(--invite-text)]">{msg.authorName}</span>
                    }
                  </div>
                </div>
              </div>
              <p className="text-sm mb-3 ml-9 text-[var(--invite-text)]">{msg.text}</p>
              <div className="flex items-center gap-3 ml-9">
                <button onClick={() => handleLike(msg)}
                  className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'font-medium text-[var(--invite-accent)]' : 'text-gray-400 hover:text-[var(--invite-accent)]'}`}>
                  <IconThumbsUp className="w-3.5 h-3.5" />
                  {msg.likedBy.length > 0 && <span>{msg.likedBy.length}</span>}
                </button>
                <button onClick={() => handleDislike(msg)}
                  className={`flex items-center gap-1 text-xs transition-colors ${disliked ? 'text-red-500 font-medium' : 'text-gray-400 hover:text-red-400'}`}>
                  <IconThumbsDown className="w-3.5 h-3.5" />
                  {msg.dislikedBy.length > 0 && <span>{msg.dislikedBy.length}</span>}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Avatar({ name, photoURL, size = 32 }: { name: string; photoURL?: string; size?: number }) {
  if (photoURL) {
    return <img src={optimizedImageUrl(photoURL, size * 2)} alt={name} loading="lazy" className="rounded-full object-cover shrink-0"
      style={{ width: size, height: size }} />
  }
  return (
    <div className="rounded-full flex items-center justify-center shrink-0 text-xs font-bold text-[var(--invite-accent)]"
      style={{ width: size, height: size, backgroundColor: 'var(--invite-accent-soft)' }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}
