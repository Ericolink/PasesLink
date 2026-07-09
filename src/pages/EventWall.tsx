import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getEvent } from '../firebase/events'
import {
  deleteWallMessage,
  getOlderWallMessages,
  pinWallMessage,
  reactToWallMessage,
  replyToWallMessage,
  subscribeToWall,
} from '../firebase/wall'
import { deletePhoto, pinPhoto, reactToPhoto, replyToPhoto, subscribeToPhotos } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { useWallComposer } from '../hooks/useWallComposer'
import { markWallSeen } from '../hooks/useWallActivity'
import { optimizedImageUrl } from '../utils/cloudinary'
import { WALL_NAME_MAX, WALL_TEXT_MAX } from '../utils/validation'
import { mergeWallFeed } from '../utils/wallFeed'
import { captureException } from '../lib/sentry'
import {
  IconCamera,
  IconHelpCircle,
  IconLightbulb,
  IconMessageSquare,
  IconMusic,
  IconPin,
  IconX,
} from '../components/Icons'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ThemeSeal } from '../components/ThemeSeal'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Avatar } from '../components/Avatar'
import { AuthorName } from '../components/AuthorName'
import { PhotoFeedCard } from '../components/PhotoFeedCard'
import { PhotoViewer } from '../components/PhotoViewer'
import { ReactionPicker } from '../components/ReactionPicker'
import { RepliesList } from '../components/RepliesList'
import { ReportButton } from '../components/ReportButton'
import { StoriesBar } from '../components/StoriesBar'
import type { EventData, ReactionType, WallMessage, WallMessageType } from '../types'

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
  const { photoBlocked, commentBlockedMessage, photoBlockedMessage } = useSanctionStatus(id)
  const [event, setEvent]           = useState<EventData | null>(null)
  const [messages, setMessages]     = useState<WallMessage[]>([])
  const [photos, setPhotos]         = useState<PhotoData[]>([])
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [loading, setLoading]       = useState(true)
  const [wallError, setWallError]   = useState('')
  const [olderMessages, setOlderMessages] = useState<WallMessage[]>([])
  const [loadingOlder, setLoadingOlder]   = useState(false)
  const [hasMoreOlder, setHasMoreOlder]   = useState(true)
  const [olderError, setOlderError]       = useState('')
  const [guestName, setGuestName]   = useState(() => localStorage.getItem(GUEST_NAME_KEY) || '')
  const [nameConfirmed, setNameConfirmed] = useState(() => !!localStorage.getItem(GUEST_NAME_KEY) || !!localStorage.getItem('firebase:authUser'))
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText]   = useState('')
  const [replyError, setReplyError] = useState('')
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOwner    = !!(user && event && user.uid === event.ownerId)
  // Moderación (fijar/eliminar mensaje, borrar/fijar foto): igual criterio
  // que el resto de la app (GuestPass, EventDetail, Scanner, firestore.rules
  // isOwnerOrCoOrg) — un co-organizador ya gestiona el evento en todas esas
  // pantallas, así que también debe poder moderar el muro. Separado de
  // `isOwner`, que sigue siendo la identidad estricta usada para publicar
  // como "Anfitrión".
  const isOrg      = isOwner || !!(user && event?.coOrganizersMap && user.uid in event.coOrganizersMap)
  const isMinor    = profile?.birthDate ? getAge(profile.birthDate) < 18 : false

  const postLabel = isOwner ? OWNER_DISPLAY : (user ? (profile?.displayName || user.displayName || guestName) : guestName)
  const postPhotoURL = isOwner ? undefined : (user ? (profile?.photoURL || user.photoURL || undefined) : undefined)
  // Mismo criterio de identidad que antes: el autor de una foto y el de un
  // mensaje del mismo visitante quedan con el mismo token.
  const authorToken = isOwner ? (user?.uid ?? 'owner') : (user ? user.uid : (localStorage.getItem(GUEST_NAME_KEY) || guestName))

  const composer = useWallComposer({
    eventId: id || '',
    authorName: postLabel,
    authorToken,
    authorRole: isOwner ? 'owner' : 'guest',
    authorPhotoURL: postPhotoURL,
    isMinor,
    photoBlocked,
    sentryComponent: 'event_wall',
  })
  const { text, setText, type, setType, attachedFile, previewUrl, maxLength, posting, error: postError, fileInputRef, openPicker, onFileSelected, removeImage, handleSubmit } = composer

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
    markWallSeen(id)
    getEvent(id).then(setEvent)
    const unsub = subscribeToWall(id, (msgs) => {
      setMessages(msgs)
      setLoading(false)
    }, (err) => {
      console.error('Error loading event wall:', err)
      setWallError('No se pudieron cargar los mensajes del muro. Verifica tu conexión.')
      setLoading(false)
    })
    const unsubPhotos = subscribeToPhotos(id, setPhotos)
    return () => { unsub(); unsubPhotos() }
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

  async function handleReply(message: WallMessage) {
    if (!id || !replyText.trim()) return
    try {
      await replyToWallMessage(
        id,
        message.id,
        replyText,
        message.replies,
        postLabel,
        authorToken,
        isOwner ? 'owner' : 'guest',
        postPhotoURL,
      )
      setReplyText('')
      setReplyingTo(null)
    } catch (err) {
      console.error('Error replying to wall message:', err)
      captureException(err, { tags: { component: 'event_wall', action: 'reply' } })
      setReplyError(err instanceof Error ? err.message : 'No se pudo enviar la respuesta. Intenta de nuevo.')
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

  // Optimista: refleja la reacción en `messages` antes de que Firestore
  // confirme (el listener en vivo la va a pisar con el eco del server en
  // cuanto llegue, pero el usuario la ve al instante). Si la escritura
  // falla, se revierte a mano.
  async function handleReact(msg: WallMessage, type: ReactionType | null) {
    if (!id) return
    const token = getDeviceToken()
    const prevReactions = msg.reactions
    const nextReactions = { ...prevReactions }
    if (type) nextReactions[token] = { type, name: postLabel || 'Invitado' }
    else delete nextReactions[token]
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: nextReactions } : m)))

    try {
      await reactToWallMessage(id, msg.id, token, postLabel || 'Invitado', type)
    } catch (err) {
      console.error('Error reacting to wall message:', err)
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: prevReactions } : m)))
    }
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

  const feed = useMemo(() => mergeWallFeed(sorted, photos), [sorted, photos])

  async function handleDeletePhoto(photoId: string) {
    if (!id) return
    await deletePhoto(id, photoId)
  }

  async function handlePinPhoto(photo: PhotoData) {
    if (!id) return
    await pinPhoto(id, photo.id, photo.pinned)
  }

  // Mismo patrón optimista que handleReact/handleReply (arriba), pero sobre
  // `photos` — reutiliza reactToPhoto/replyToPhoto (src/firebase/photos.ts),
  // que a su vez comparten motor con los mensajes (ver
  // src/firebase/interactions.ts). Una reacción/respuesta hecha desde una
  // historia (PhotoViewer modo story, vía StoriesBar) actualiza el mismo
  // estado `photos` que la card del feed, así que ambas vistas quedan en
  // sync sin lógica extra.
  async function handleReactPhoto(photo: PhotoData, type: ReactionType | null) {
    if (!id) return
    const token = getDeviceToken()
    const prevReactions = photo.reactions
    const nextReactions = { ...prevReactions }
    if (type) nextReactions[token] = { type, name: postLabel || 'Invitado' }
    else delete nextReactions[token]
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, reactions: nextReactions } : p)))

    try {
      await reactToPhoto(id, photo.id, token, postLabel || 'Invitado', type)
    } catch (err) {
      console.error('Error reacting to photo:', err)
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, reactions: prevReactions } : p)))
    }
  }

  async function handleReplyPhoto(photo: PhotoData, text: string) {
    if (!id) return
    await replyToPhoto(id, photo.id, text, photo.replies, postLabel, authorToken, isOwner ? 'owner' : 'guest', postPhotoURL)
  }

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

  const content = (
    <>
      {event?.coverImage && (
        <img src={optimizedImageUrl(event.coverImage, 800)} alt="" loading="eager" fetchPriority="high" crossOrigin="anonymous" className="w-full h-28 object-cover rounded-xl mb-4" />
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

      {id && (
        <StoriesBar
          eventId={id}
          photos={photos}
          myToken={getDeviceToken()}
          canReply={!isMinor && !commentBlockedMessage}
          onReact={handleReactPhoto}
          onReply={handleReplyPhoto}
        />
      )}

      {/* FAB de acceso rápido al composer, solo mobile: en un muro largo,
          comentar exigía scrollear hasta el formulario arriba del feed —
          este botón lleva ahí y enfoca el textarea directo (el teclado se
          abre solo, comportamiento nativo del focus, sin manejo especial). */}
      {!isMinor && !commentBlockedMessage && (
        <button
          onClick={() => {
            textareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
            setTimeout(() => textareaRef.current?.focus(), 350)
          }}
          aria-label="Escribir comentario"
          className="sm:hidden fixed z-30 w-14 h-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          style={{ bottom: 'calc(1.25rem + env(safe-area-inset-bottom))', right: '1rem' }}
        >
          <IconMessageSquare className="w-6 h-6" />
        </button>
      )}

      {/* Age restriction notice */}
      {user && isMinor && (
        <div className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          Solo puedes dar me gusta — los comentarios están disponibles para mayores de 18 años.
        </div>
      )}

      {/* Sanción activa — Firestore rules es la barrera real (ver
          firestore.rules), este aviso solo evita que el usuario se tope con
          un error de permisos genérico al intentar publicar. */}
      {commentBlockedMessage && (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">
          {commentBlockedMessage}
        </div>
      )}

      {/* Post form */}
      {!isMinor && !commentBlockedMessage && (
        <form onSubmit={handleSubmit} className="invite-wall-form bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
          {!attachedFile && (
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
          )}
          {photoBlockedMessage && <p className="text-xs text-red-500">{photoBlockedMessage}</p>}
          <div className="flex items-start gap-2">
            <Avatar name={postLabel} photoURL={postPhotoURL} size={28} />
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={attachedFile ? 'Agregá un mensaje (opcional)…' : `Escribe tu ${TYPE_CONFIG[type].label.toLowerCase()}…`}
                rows={2}
                maxLength={maxLength}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary bg-transparent"
              />
              {previewUrl && (
                <div className="relative inline-block mt-2">
                  <img src={previewUrl} alt="" className="h-24 w-24 rounded-lg object-cover border border-gray-200 dark:border-gray-600" />
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="Quitar foto"
                    className="absolute -top-2 -right-2 bg-gray-900/80 text-white rounded-full p-1 hover:bg-gray-900"
                  >
                    <IconX className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={openPicker}
              disabled={photoBlocked}
              aria-label="Adjuntar foto"
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-500 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600 disabled:opacity-40 transition-colors"
            >
              <IconCamera className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Como: <AuthorName name={postLabel} role={isOwner ? 'owner' : 'guest'} />
            </span>
            <span className="text-xs text-gray-400">{text.length}/{maxLength}</span>
            <button
              type="submit"
              disabled={posting || (!text.trim() && !attachedFile)}
              className="bg-primary text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:bg-primary-dark transition-colors disabled:opacity-40"
            >
              {posting ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
          {(postError || replyError) && <p className="text-xs text-red-500">{postError || replyError}</p>}
        </form>
      )}

      {loading && <p className="text-center text-gray-400 text-sm">Cargando mensajes…</p>}

      {wallError && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-4">
          {wallError}
        </p>
      )}

      {!loading && !wallError && feed.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {feed.map((item) => {
          if (item.kind === 'photo') {
            return (
              <PhotoFeedCard
                key={item.id}
                photo={item.photo}
                isOrg={isOrg}
                onOpen={() => setGalleryIndex(photos.findIndex((p) => p.id === item.photo.id))}
                onDelete={handleDeletePhoto}
                onPin={handlePinPhoto}
                templateId={event?.templateId}
                eventId={id || ''}
                eventName={event?.name || ''}
                myToken={getDeviceToken()}
                canReply={!isMinor && !commentBlockedMessage}
                onReact={handleReactPhoto}
                onReply={handleReplyPhoto}
              />
            )
          }
          const msg       = item.message
          const cfg       = TYPE_CONFIG[msg.type]
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
                    <AuthorName name={msg.authorName} role={msg.authorRole} />
                  </div>
                </div>
                {/* Owner/co-org actions */}
                {isOrg && (
                  <div className="flex items-center -mr-2 shrink-0">
                    <button
                      onClick={() => handlePin(msg)}
                      title={msg.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
                      aria-label={msg.pinned ? 'Quitar destacado' : 'Destacar mensaje'}
                      className={`p-2.5 transition-colors ${msg.pinned ? 'text-yellow-500 hover:text-yellow-400' : 'text-gray-400 hover:text-yellow-500'}`}
                    >
                      <IconPin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingMessageId(msg.id)}
                      aria-label="Eliminar mensaje"
                      className="p-2.5 text-xs text-red-400 hover:text-red-600"
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </div>

              <p className="text-sm text-gray-900 dark:text-white mb-3 ml-9">{msg.text}</p>

              {/* Replies */}
              <RepliesList replies={msg.replies} />

              {/* Reactions row — padding del botón deja el target táctil real
                  en ~40px+ (antes el botón era solo el ícono de 14px,
                  imposible de tocar con precisión en celular); ml-[1.625rem]
                  = ml-9 (36px) menos el padding nuevo (p-2.5 = 10px), para
                  que el ícono siga alineado con el resto del bloque. */}
              <div className="flex items-center gap-1 ml-[1.625rem]">
                <ReactionPicker
                  reactions={msg.reactions}
                  myToken={getDeviceToken()}
                  onReact={(type) => handleReact(msg, type)}
                />
                {!isMinor && !commentBlockedMessage && replyingTo !== msg.id && (
                  <button onClick={() => setReplyingTo(msg.id)} className="text-xs text-gray-400 hover:text-primary">
                    Responder
                  </button>
                )}
                {id && (
                  <ReportButton
                    eventId={id}
                    eventName={event?.name || ''}
                    contentType="comment"
                    contentId={msg.id}
                    contentSnapshot={msg.text}
                    contentAuthorName={msg.authorName}
                    contentAuthorToken={msg.authorToken}
                  />
                )}
              </div>

              {/* Reply input */}
              {!isMinor && !commentBlockedMessage && replyingTo === msg.id && (
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

      {galleryIndex !== null && (
        <PhotoViewer
          photos={photos}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGalleryIndex(null)}
          mode="gallery"
          isOrg={isOrg}
          onDelete={handleDeletePhoto}
        />
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
