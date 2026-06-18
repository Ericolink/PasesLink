import React, { useEffect, useRef, useState } from 'react'
import { likeWallMessage, dislikeWallMessage, postWallMessage, subscribeToWall } from '../firebase/wall'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { optimizedImageUrl } from '../utils/cloudinary'
import { IconThumbsUp, IconThumbsDown, IconMessageSquare, IconHelpCircle, IconMusic, IconLightbulb, IconCrown } from './Icons'
import type { WallMessage, WallMessageType } from '../types'

const DEVICE_TOKEN_KEY = 'wall_device_token'
const GUEST_NAME_KEY   = 'wall_guest_name'

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
  const [text, setText]         = useState('')
  const [type, setType]         = useState<WallMessageType>('comment')
  const [posting, setPosting]   = useState(false)
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
    })
    return unsub
  }, [eventId])

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim() || isMinor) return
    setPosting(true)
    try {
      const token = user ? user.uid : (resolvedGuestName || crypto.randomUUID())
      await postWallMessage(eventId, text, type, authorName, token, 'guest', authorPhoto)
      setText('')
      textareaRef.current?.focus()
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
    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
      <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Muro del evento</h2>

      {/* Age restriction notice */}
      {user && isMinor && (
        <div className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          Solo puedes dar me gusta — los comentarios están disponibles para mayores de 18 años.
        </div>
      )}

      {/* Post form */}
      {canPost && (
        <form onSubmit={handlePost} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 space-y-3">
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
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Como: <strong>{authorName}</strong></span>
            <button type="submit" disabled={posting || !text.trim()}
              className="bg-primary text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40">
              {posting ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </form>
      )}

      {loading && <p className="text-center text-gray-400 text-sm py-4">Cargando mensajes...</p>}
      {!loading && messages.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-6">Sé el primero en escribir algo</p>
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
              className={`bg-white dark:bg-gray-800 rounded-xl border p-4 ${
                msg.pinned
                  ? 'border-yellow-400/60 dark:border-yellow-500/40'
                  : 'border-gray-200 dark:border-gray-700'
              }`}>
              <div className="flex items-start gap-2 mb-2">
                <Avatar name={msg.authorName} photoURL={msg.authorPhotoURL} size={28} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
                      <cfg.Icon className="w-3 h-3" />
                      {cfg.label}
                    </span>
                    {isOwnerMsg && isPremium
                      ? <span className="inline-flex items-center gap-1 text-xs font-bold"
                          style={{ color: '#FAEF5D', textShadow: '0 0 8px rgba(250,239,93,.8)' }}>
                          <IconCrown className="w-3 h-3" />{msg.authorName}
                        </span>
                      : isOwnerMsg
                        ? <span className="text-xs font-bold text-primary">{msg.authorName}</span>
                        : <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.authorName}</span>
                    }
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-900 dark:text-white mb-3 ml-9">{msg.text}</p>
              <div className="flex items-center gap-3 ml-9">
                <button onClick={() => handleLike(msg)}
                  className={`flex items-center gap-1 text-xs transition-colors ${liked ? 'text-primary font-medium' : 'text-gray-400 hover:text-primary'}`}>
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
    <div className="rounded-full bg-primary/20 flex items-center justify-center shrink-0 text-xs font-bold text-primary"
      style={{ width: size, height: size }}>
      {name?.[0]?.toUpperCase() || '?'}
    </div>
  )
}
