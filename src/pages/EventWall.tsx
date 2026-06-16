import React, { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getEvent } from '../firebase/events'
import {
  deleteWallMessage,
  likeWallMessage,
  postWallMessage,
  replyToWallMessage,
  subscribeToWall,
} from '../firebase/wall'
import { useAuth } from '../hooks/useAuth'
import {
  IconHelpCircle,
  IconLightbulb,
  IconMessageSquare,
  IconMusic,
  IconThumbsUp,
  IconX,
} from '../components/Icons'
import type { EventData, WallMessage, WallMessageType } from '../types'

interface TypeConfig {
  label: string
  Icon: ({ className }: { className?: string }) => React.ReactElement
  color: string
}

const TYPE_CONFIG: Record<WallMessageType, TypeConfig> = {
  comment: { label: 'Comentario', Icon: IconMessageSquare, color: 'bg-blue-100 text-blue-700' },
  question: { label: 'Pregunta', Icon: IconHelpCircle, color: 'bg-yellow-100 text-yellow-700' },
  music: { label: 'Música', Icon: IconMusic, color: 'bg-purple-100 text-purple-700' },
  idea: { label: 'Idea', Icon: IconLightbulb, color: 'bg-green-100 text-green-700' },
}

const GUEST_NAME_KEY = 'wall_guest_name'

export function EventWall() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuth()
  const [event, setEvent] = useState<EventData | null>(null)
  const [messages, setMessages] = useState<WallMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [guestName, setGuestName] = useState(() => localStorage.getItem(GUEST_NAME_KEY) || '')
  const [nameConfirmed, setNameConfirmed] = useState(!!localStorage.getItem(GUEST_NAME_KEY))
  const [text, setText] = useState('')
  const [type, setType] = useState<WallMessageType>('comment')
  const [posting, setPosting] = useState(false)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOwner = user && event && user.uid === event.ownerId

  useEffect(() => {
    if (!id) return
    getEvent(id).then(setEvent)
    const unsub = subscribeToWall(id, (msgs) => {
      setMessages(msgs)
      setLoading(false)
    })
    return unsub
  }, [id])

  function confirmName(e: React.FormEvent) {
    e.preventDefault()
    if (!guestName.trim()) return
    localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
    setNameConfirmed(true)
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!id || !text.trim() || !guestName) return
    setPosting(true)
    try {
      await postWallMessage(id, text, type, guestName, localStorage.getItem(GUEST_NAME_KEY) || guestName)
      setText('')
      textareaRef.current?.focus()
    } finally {
      setPosting(false)
    }
  }

  async function handleReply(message: WallMessage) {
    if (!id || !replyText.trim()) return
    await replyToWallMessage(id, message.id, replyText, message.replies)
    setReplyText('')
    setReplyingTo(null)
  }

  async function handleDelete(messageId: string) {
    if (!id) return
    await deleteWallMessage(id, messageId)
  }

  async function handleLike(messageId: string) {
    if (!id) return
    await likeWallMessage(id, messageId)
  }

  if (!nameConfirmed && !isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 animate-fade-in">
          <h1 className="text-lg font-bold text-gray-900 dark:text-white mb-1">
            {event?.name || 'Muro del evento'}
          </h1>
          <p className="text-sm text-gray-500 mb-4">¿Cómo te llamas para participar?</p>
          <form onSubmit={confirmName} className="space-y-3">
            <input
              type="text"
              required
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
      </div>
    )
  }

  const authorLabel = isOwner ? (user?.displayName || 'Anfitrión') : guestName

  return (
    <div className="max-w-xl mx-auto px-4 py-6 min-h-screen">
      {event?.coverImage && (
        <img src={event.coverImage} alt="" className="w-full h-28 object-cover rounded-xl mb-4" />
      )}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{event?.name}</h1>
          <p className="text-xs text-gray-500">Muro del evento</p>
        </div>
        {!isOwner && (
          <button
            onClick={() => { localStorage.removeItem(GUEST_NAME_KEY); setNameConfirmed(false) }}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Cambiar nombre
          </button>
        )}
      </div>

      {/* Post form */}
      <form onSubmit={handlePost} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
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
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Escribe tu ${TYPE_CONFIG[type].label.toLowerCase()}...`}
          rows={2}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Como: <strong>{authorLabel}</strong></span>
          <button
            type="submit"
            disabled={posting || !text.trim()}
            className="bg-primary text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
          >
            {posting ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </form>

      {/* Messages */}
      {loading && <p className="text-center text-gray-400 text-sm">Cargando mensajes...</p>}

      {!loading && messages.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {messages.map((msg) => {
          const cfg = TYPE_CONFIG[msg.type]
          return (
            <div key={msg.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 animate-fade-in-up">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <span className={`flex items-center gap-1 text-xs rounded-full px-2 py-0.5 font-medium ${cfg.color}`}>
                    <cfg.Icon className="w-3 h-3" />
                    {cfg.label}
                  </span>
                  <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">{msg.authorName}</span>
                </div>
                {isOwner && (
                  <button onClick={() => handleDelete(msg.id)} className="text-xs text-red-400 hover:text-red-600 shrink-0">
                    Eliminar
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-800 dark:text-gray-200 mb-3">{msg.text}</p>

              {/* Replies */}
              {msg.replies.length > 0 && (
                <div className="border-l-2 border-gray-100 dark:border-gray-700 pl-3 mb-3 space-y-2">
                  {msg.replies.map((r) => (
                    <div key={r.id}>
                      <span className="text-xs font-semibold text-primary">Anfitrión · </span>
                      <span className="text-xs text-gray-700 dark:text-gray-300">{r.text}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={() => handleLike(msg.id)}
                  className="flex items-center gap-1 text-xs text-gray-400 hover:text-primary transition-colors"
                >
                  <IconThumbsUp className="w-3.5 h-3.5" />
                  {msg.likes > 0 && <span>{msg.likes}</span>}
                </button>
                {isOwner && replyingTo !== msg.id && (
                  <button onClick={() => setReplyingTo(msg.id)} className="text-xs text-gray-400 hover:text-primary">
                    Responder
                  </button>
                )}
              </div>

              {isOwner && replyingTo === msg.id && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="Escribe tu respuesta..."
                    autoFocus
                    className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
                    onKeyDown={(e) => { if (e.key === 'Enter') handleReply(msg) }}
                  />
                  <button onClick={() => handleReply(msg)} className="bg-primary text-white rounded-md px-3 py-1.5 text-xs font-medium">
                    Enviar
                  </button>
                  <button onClick={() => setReplyingTo(null)} className="flex items-center text-gray-400 hover:text-gray-600">
                    <IconX className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
