import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { reactToWallMessage, fetchWallMessages } from '../firebase/wall'
import { fetchPhotos, reactToPhoto, replyToPhoto } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { useAuth } from '../hooks/useAuth'
import { useUserProfile } from '../hooks/useUserProfile'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { useWallComposer } from '../hooks/useWallComposer'
import { IconCrown, IconRotateCcw, IconCamera, IconX } from './Icons'
import { ThemeSeal } from './ThemeSeal'
import { Avatar } from './Avatar'
import { PhotoFeedCard } from './PhotoFeedCard'
import { PhotoViewer } from './PhotoViewer'
import { ReactionPicker } from './ReactionPicker'
import { ReportButton } from './ReportButton'
import { StoriesBar } from './StoriesBar'
import { WallTypeChipSelector } from './WallTypeChipSelector'
import { WALL_TYPE_CONFIG } from '../utils/wallMessageTypes'
import { mergeWallFeed } from '../utils/wallFeed'
import { captureException } from '../lib/sentry'
import type { ReactionType, TemplateId, WallMessage } from '../types'

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

const TYPE_CONFIG = WALL_TYPE_CONFIG

interface Props { eventId: string; eventName?: string; guestName?: string; guestToken?: string; templateId?: TemplateId }

export function WallSection({ eventId, eventName = '', guestName: guestNameProp, guestToken, templateId }: Props) {
  const { user }          = useAuth()
  const { profile }       = useUserProfile()
  const { photoBlocked, commentBlockedMessage, photoBlockedMessage } = useSanctionStatus(eventId)
  const [messages, setMessages] = useState<WallMessage[]>([])
  const [photos, setPhotos]     = useState<PhotoData[]>([])
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null)
  const [loading, setLoading]   = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [wallError, setWallError] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isMinor = profile?.birthDate ? getAge(profile.birthDate) < 18 : false

  // Name resolution: prop → localStorage → empty
  const resolvedGuestName = guestNameProp || localStorage.getItem(GUEST_NAME_KEY) || ''
  const authorName  = user ? (profile?.displayName || user.displayName || 'Anfitrión') : resolvedGuestName
  const authorPhoto = user ? (profile?.photoURL || user.photoURL || undefined) : undefined
  // Mismo criterio de identidad que handlePost — el qrToken real (guestToken,
  // pasado por GuestPass/EventJoin) si está disponible, si no el mismo
  // fallback que se usa para publicar mensajes.
  const photoAuthorToken = guestToken || (user ? user.uid : resolvedGuestName)
  // Distinto criterio de identidad para mensajes de texto (no prioriza
  // guestToken) — el formulario solo se muestra cuando `canPost` es true, así
  // que `resolvedGuestName` ya está garantizado si no hay `user`.
  const messageAuthorToken = user ? user.uid : resolvedGuestName

  // Sin listener permanente a propósito: este widget se monta en páginas
  // 100% públicas de alto tráfico (GuestPass, EventJoin). Un onSnapshot por
  // visitante ahí es el patrón de mayor riesgo de costo del proyecto. Se
  // carga una vez al montar y se vuelve a pedir solo ante una acción
  // explícita (botón "Actualizar", o la propia publicación/like/dislike del
  // usuario) — ver EventWall.tsx para la vista con tiempo real real.
  // `loading` solo cubre la primera carga (controla el placeholder inicial,
  // antes de tener ningún mensaje); `refreshing` cubre cualquier llamada
  // posterior (botón, post, like/dislike) — separados para no hacer
  // reaparecer "Cargando mensajes…" encima de la lista ya renderizada cada
  // vez que alguien da like.
  const loadMessages = useCallback(async () => {
    setRefreshing(true)
    setWallError('')
    try {
      const msgs = await fetchWallMessages(eventId, WALL_SECTION_LIVE_LIMIT)
      setMessages(msgs.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1
        if (!a.pinned && b.pinned) return 1
        return b.createdAt - a.createdAt
      }))
    } catch (err) {
      console.error('Error loading wall section:', err)
      captureException(err, { tags: { component: 'wall_section', action: 'load' } })
      setWallError('No se pudieron cargar los mensajes del muro.')
    } finally {
      setRefreshing(false)
      setLoading(false)
    }
  }, [eventId])

  const loadPhotos = useCallback(() => {
    fetchPhotos(eventId).then(setPhotos).catch(() => {})
  }, [eventId])

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    loadMessages()
    loadPhotos()
  }, [loadMessages, loadPhotos])
  /* eslint-enable react-hooks/set-state-in-effect */

  const feed = useMemo(() => mergeWallFeed(messages, photos), [messages, photos])

  const composer = useWallComposer({
    eventId,
    authorName,
    authorToken: messageAuthorToken,
    authorRole: 'guest',
    authorPhotoURL: authorPhoto,
    photoAuthorToken,
    isMinor,
    photoBlocked,
    sentryComponent: 'wall_section',
    // Sin esto, la propia publicación no aparecería hasta que el usuario
    // presione "Actualizar" — la pérdida de tiempo real es aceptada para
    // mensajes/fotos de otros, no para la propia acción.
    onPosted: () => { textareaRef.current?.focus(); loadMessages() },
    onPhotoUploaded: loadPhotos,
  })
  const {
    text, setText, type, setType, attachedFile, previewUrl, maxLength,
    posting, error: postError, fileInputRef, openPicker, onFileSelected, removeImage, handleSubmit,
  } = composer

  // Optimista: la reacción se refleja en `messages` antes de que Firestore
  // confirme, y solo se revierte si la escritura falla — evita el viaje
  // redondo de un `loadMessages()` completo (que además recargaría fotos y
  // reordenaría toda la lista) por cada tap en una carita.
  async function handleReact(msg: WallMessage, type: ReactionType | null) {
    const token = getDeviceToken()
    const prevReactions = msg.reactions
    const nextReactions = { ...prevReactions }
    // Date.now() acá corre solo al tocar una reacción (evento de usuario),
    // nunca durante un render — react-hooks/purity no distingue eso de un
    // impuro dentro del cuerpo de render y lo marca en falso positivo.
    // eslint-disable-next-line react-hooks/purity
    if (type) nextReactions[token] = { type, name: authorName || 'Invitado', reactedAt: Date.now(), ...(authorPhoto ? { photoURL: authorPhoto } : {}) }
    else delete nextReactions[token]
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: nextReactions } : m)))

    try {
      await reactToWallMessage(eventId, msg.id, token, authorName || 'Invitado', type, authorPhoto)
    } catch (err) {
      console.error('Error reacting to wall message:', err)
      setMessages((prev) => prev.map((m) => (m.id === msg.id ? { ...m, reactions: prevReactions } : m)))
    }
  }

  // Mismo patrón optimista que handleReact, sobre `photos` — reutiliza
  // reactToPhoto/replyToPhoto (src/firebase/photos.ts), que comparten motor
  // con los mensajes (ver src/firebase/interactions.ts).
  async function handleReactPhoto(photo: PhotoData, type: ReactionType | null) {
    const token = getDeviceToken()
    const prevReactions = photo.reactions
    const nextReactions = { ...prevReactions }
    if (type) nextReactions[token] = { type, name: authorName || 'Invitado', reactedAt: Date.now(), ...(authorPhoto ? { photoURL: authorPhoto } : {}) }
    else delete nextReactions[token]
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, reactions: nextReactions } : p)))

    try {
      await reactToPhoto(eventId, photo.id, token, authorName || 'Invitado', type, authorPhoto)
    } catch (err) {
      console.error('Error reacting to photo:', err)
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, reactions: prevReactions } : p)))
    }
  }

  // A diferencia de EventWall.tsx (con listener en vivo, ver comentario en
  // loadMessages más arriba), este widget no tiene onSnapshot — la propia
  // respuesta se agrega a mano al estado local en vez de esperar un refresh
  // manual del usuario (mismo criterio que onPosted/onPhotoUploaded del
  // composer: la propia acción se refleja al toque).
  async function handleReplyPhoto(photo: PhotoData, text: string) {
    const newReply = await replyToPhoto(eventId, photo.id, text, authorName, messageAuthorToken, 'guest', authorPhoto)
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, replies: [...p.replies, newReply] } : p)))
  }

  const canPost = user ? !isMinor : !!resolvedGuestName

  return (
    <div className="invite-wall-section relative mt-8 pt-6 border-t" style={{ borderColor: 'var(--invite-border)' }}>
      <StoriesBar
        eventId={eventId}
        photos={photos}
        myToken={getDeviceToken()}
        canReply={canPost && !commentBlockedMessage}
        onReact={handleReactPhoto}
        onReply={handleReplyPhoto}
      />
      <div className="flex items-center gap-2 mb-4">
        <h2 className="text-lg font-bold text-[var(--invite-text)]">Muro del evento</h2>
        <button
          onClick={() => { loadMessages(); loadPhotos() }}
          disabled={refreshing}
          aria-label={refreshing ? 'Actualizando muro…' : 'Actualizar muro'}
          title="Actualizar muro"
          className="p-1 rounded-full disabled:opacity-50 text-[var(--invite-accent)]"
        >
          <IconRotateCcw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Age restriction notice */}
      {user && isMinor && (
        <div className="text-xs text-amber-500 bg-amber-500/10 rounded-lg px-3 py-2 mb-4">
          Solo puedes dar me gusta — los comentarios están disponibles para mayores de 18 años.
        </div>
      )}

      {/* Sanción activa — Firestore rules es la barrera real (ver
          firestore.rules), este aviso solo evita que el usuario se tope con
          un error de permisos genérico al intentar publicar. */}
      {user && commentBlockedMessage && (
        <div className="text-xs text-red-500 bg-red-500/10 rounded-lg px-3 py-2 mb-4">
          {commentBlockedMessage}
        </div>
      )}

      {/* Post form */}
      {canPost && !commentBlockedMessage && (
        <form
          onSubmit={handleSubmit}
          className="invite-wall-form border p-4 mb-4 space-y-3 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
          style={{ borderColor: 'var(--invite-border)' }}
        >
          {!attachedFile && <WallTypeChipSelector value={type} onChange={setType} />}
          {photoBlockedMessage && (
            <p className="text-xs text-red-500">{photoBlockedMessage}</p>
          )}
          <div className="flex items-start gap-2">
            <Avatar name={authorName} photoURL={authorPhoto} size={28} />
            <div className="flex-1 min-w-0">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={attachedFile ? 'Agregá un mensaje (opcional)…' : `Escribe tu ${TYPE_CONFIG[type].label.toLowerCase()}…`}
                rows={2}
                maxLength={maxLength}
                className="w-full border rounded-md px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 bg-transparent text-[var(--invite-text)] focus:ring-[var(--invite-accent)]"
                style={{ borderColor: 'var(--invite-border)' }}
              />
              {previewUrl && (
                <div className="relative inline-block mt-2">
                  <img src={previewUrl} alt="" className="h-24 w-24 rounded-lg object-cover border" style={{ borderColor: 'var(--invite-border)' }} />
                  <button
                    type="button"
                    onClick={removeImage}
                    aria-label="Quitar foto"
                    className="absolute -top-2 -right-2 bg-black/70 text-white rounded-full p-1 hover:bg-black/90"
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
              className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center disabled:opacity-40 transition-colors text-[var(--invite-text-muted)]"
              style={{ background: 'var(--invite-page-bg, rgba(255,255,255,0.06))' }}
            >
              <IconCamera className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--invite-text-muted)]">Como: <strong>{authorName}</strong></span>
            <span className="text-xs text-[var(--invite-text-muted)]">{text.length}/{maxLength}</span>
            <button type="submit" disabled={posting || (!text.trim() && !attachedFile)}
              className="text-white rounded-lg px-4 py-1.5 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 bg-[var(--invite-accent)]">
              {posting ? 'Publicando…' : 'Publicar'}
            </button>
          </div>
          {postError && <p className="text-xs text-red-500">{postError}</p>}
        </form>
      )}

      {loading && <p className="text-center text-sm py-4 text-[var(--invite-text-muted)]">Cargando mensajes…</p>}
      {wallError && (
        <p className="text-xs text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-3">
          {wallError}
        </p>
      )}
      {!loading && !wallError && feed.length === 0 && (
        <p className="text-center text-sm py-6 text-[var(--invite-text-muted)]">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {feed.map((item) => {
          if (item.kind === 'photo') {
            return (
              <PhotoFeedCard
                key={item.id}
                photo={item.photo}
                isOrg={false}
                onOpen={() => setGalleryIndex(photos.findIndex((p) => p.id === item.photo.id))}
                templateId={templateId}
                eventId={eventId}
                eventName={eventName}
                myToken={getDeviceToken()}
                canReply={canPost && !commentBlockedMessage}
                onReact={handleReactPhoto}
                onReply={handleReplyPhoto}
              />
            )
          }
          const msg       = item.message
          const cfg       = TYPE_CONFIG[msg.type]
          const isOwnerMsg = msg.authorRole === 'owner'
          return (
            <div key={msg.id}
              data-pinned={msg.pinned}
              className="invite-wall-message border p-4 bg-[var(--invite-surface)] [border-radius:var(--invite-radius)]"
              style={{ borderColor: msg.pinned ? '#facc15' : 'var(--invite-border)' }}>
              {msg.pinned && <ThemeSeal templateId={templateId} />}
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
                    {isOwnerMsg
                      ? <span className="min-w-0 inline-flex items-center gap-1 text-xs font-bold"
                          style={{ color: '#E8B84B', textShadow: '0 0 8px rgba(232,184,75,.8)' }}>
                          <IconCrown className="w-3 h-3 shrink-0" /><span className="min-w-0 truncate">{msg.authorName}</span>
                        </span>
                      : <span className="min-w-0 truncate text-xs font-semibold text-[var(--invite-text)]">{msg.authorName}</span>
                    }
                  </div>
                </div>
              </div>
              <p className="text-sm mb-3 ml-9 text-[var(--invite-text)]">{msg.text}</p>
              <div className="flex items-center gap-1 ml-[1.625rem]">
                {/* ml-9 (36px) del texto de arriba menos el padding nuevo del
                    botón (p-2.5 = 10px) mantiene el ícono alineado con el
                    resto del bloque — el padding deja el target táctil real
                    en ~40px+ (antes el botón era solo el ícono de 14px,
                    imposible de tocar con precisión en celular). */}
                <ReactionPicker
                  reactions={msg.reactions}
                  myToken={getDeviceToken()}
                  onReact={(type) => handleReact(msg, type)}
                />
                <ReportButton
                  eventId={eventId}
                  eventName={eventName}
                  contentType="comment"
                  contentId={msg.id}
                  contentSnapshot={msg.text}
                  contentAuthorName={msg.authorName}
                  contentAuthorToken={msg.authorToken}
                />
              </div>
            </div>
          )
        })}
      </div>

      {galleryIndex !== null && (
        <PhotoViewer
          photos={photos}
          index={galleryIndex}
          onIndexChange={setGalleryIndex}
          onClose={() => setGalleryIndex(null)}
          mode="gallery"
        />
      )}
    </div>
  )
}
