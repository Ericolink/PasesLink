import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { deletePhoto, getOlderPhotos, pinPhoto, reactToPhoto, replyToPhoto, subscribeToPhotos } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { useAuth } from '../hooks/useAuth'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useUserProfile } from '../hooks/useUserProfile'
import { useSanctionStatus } from '../hooks/useSanctionStatus'
import { useWallComposer } from '../hooks/useWallComposer'
import { markWallSeen } from '../hooks/useWallActivity'
import { optimizedImageUrl } from '../utils/cloudinary'
import { WALL_NAME_MAX } from '../utils/validation'
import { mergeWallFeed } from '../utils/wallFeed'
import { captureException } from '../lib/sentry'
import {
  IconArrowLeft,
  IconCamera,
  IconX,
} from '../components/Icons'
import { InvitationThemeRoot } from '../components/InvitationThemeRoot'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { Button } from '../components/Button'
import { FieldError } from '../components/FieldError'
import { Avatar } from '../components/Avatar'
import { AuthorName } from '../components/AuthorName'
import { PhotoFeedCard } from '../components/PhotoFeedCard'
import { PhotoViewer } from '../components/PhotoViewer'
import { StoriesBar } from '../components/StoriesBar'
import { WallMessageCard } from '../components/WallMessageCard'
import { WallTypeChipSelector } from '../components/WallTypeChipSelector'
import { WALL_TYPE_CONFIG } from '../utils/wallMessageTypes'
import type { EventData, ReactionType, WallMessage } from '../types'

const TYPE_CONFIG = WALL_TYPE_CONFIG

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
  const [olderPhotos, setOlderPhotos]     = useState<PhotoData[]>([])
  const [loadingOlderPhotos, setLoadingOlderPhotos] = useState(false)
  const [hasMoreOlderPhotos, setHasMoreOlderPhotos] = useState(true)
  const [olderPhotosError, setOlderPhotosError]     = useState('')
  const [guestName, setGuestName]   = useState(() => localStorage.getItem(GUEST_NAME_KEY) || '')
  const [nameConfirmed, setNameConfirmed] = useState(() => !!localStorage.getItem(GUEST_NAME_KEY) || !!localStorage.getItem('firebase:authUser'))
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Estable entre renders (localStorage, nunca cambia durante la sesión) —
  // se computa una sola vez acá en vez de llamar getDeviceToken() de nuevo
  // por cada card del feed en cada render.
  const [deviceToken] = useState(getDeviceToken)

  const isOwner    = !!(user && event && user.uid === event.ownerId)
  const perms = useEventPermissions(event, user)
  // Moderación (fijar/eliminar mensaje, borrar/fijar foto): permiso
  // moderateWall (ver src/types/coOrganizerPermissions.ts) — separado de
  // `isOwner`, que sigue siendo la identidad estricta usada para publicar
  // como "Anfitrión" (no un permiso otorgable, ver comentario donde se arma
  // postLabel/authorRole más abajo).
  const isOrg      = perms.moderateWall
  const isMinor    = profile?.birthDate ? getAge(profile.birthDate) < 18 : false
  // perms.canPostWall (useEventPermissions/resolveEventPermissions) ya
  // resuelve que postWall solo restringe a coanfitriones, nunca al dueño ni
  // a un invitado sin relación con el evento.
  const canPostWall = perms.canPostWall

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

  async function handleLoadOlderPhotos() {
    if (!id || loadingOlderPhotos) return
    setLoadingOlderPhotos(true)
    setOlderPhotosError('')
    try {
      const allLoaded = [...photos, ...olderPhotos]
      const oldest = allLoaded.length > 0 ? Math.min(...allLoaded.map((p) => p.createdAt)) : Date.now()
      const { photos: older, hasMore } = await getOlderPhotos(id, oldest)
      setOlderPhotos((prev) => [...prev, ...older])
      setHasMoreOlderPhotos(hasMore)
    } catch (err) {
      console.error('Error loading older photos:', err)
      setOlderPhotosError('No se pudieron cargar fotos anteriores. Intenta de nuevo.')
    } finally {
      setLoadingOlderPhotos(false)
    }
  }

  function confirmName(e: React.FormEvent) {
    e.preventDefault()
    if (!guestName.trim()) return
    localStorage.setItem(GUEST_NAME_KEY, guestName.trim())
    setNameConfirmed(true)
  }

  // Ya no atrapa el error para setear un state compartido: WallMessageCard
  // (memoizado, ver components/WallMessageCard.tsx) guarda su propio texto
  // de respuesta LOCAL, así que este handler solo necesita propagar el error
  // (throw) para que la card lo muestre junto a SU propio input, en vez de
  // un replyError global que antes vivía acá y obligaba a que todo el feed
  // recibiera props nuevas (y se re-renderizara) en cada tecla escrita.
  const handleReply = useCallback(async (message: WallMessage, text: string) => {
    if (!id) return
    try {
      await replyToWallMessage(id, message.id, text, postLabel, authorToken, isOwner ? 'owner' : 'guest', postPhotoURL)
    } catch (err) {
      console.error('Error replying to wall message:', err)
      captureException(err, { tags: { component: 'event_wall', action: 'reply' } })
      throw err
    }
  }, [id, postLabel, authorToken, isOwner, postPhotoURL])

  async function confirmDeleteMessage() {
    if (!id || !deletingMessageId) return
    await deleteWallMessage(id, deletingMessageId)
    setDeletingMessageId(null)
  }

  const handlePin = useCallback(async (msg: WallMessage) => {
    if (!id) return
    await pinWallMessage(id, msg.id, msg.pinned)
  }, [id])

  // El estado optimista de "mi reacción" (y su revert si la escritura falla)
  // ahora vive en ReactionPicker (ver utils/reactions.ts) — este handler solo
  // dispara la escritura real y re-lanza el error para que ese revert pueda
  // ocurrir; ya no muta `messages` a mano (auditoría F2/F11, `reactions` dejó
  // de ser el campo que representa esto).
  const handleReact = useCallback(async (msg: WallMessage, type: ReactionType | null) => {
    if (!id) return
    try {
      await reactToWallMessage(id, msg.id, getDeviceToken(), postLabel || 'Invitado', type, postPhotoURL)
    } catch (err) {
      console.error('Error reacting to wall message:', err)
      throw err
    }
  }, [id, postLabel, postPhotoURL])

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

  // Fotos en vivo (ventana reciente) + históricas cargadas a pedido, mismo
  // criterio anti-duplicado que `sorted` arriba (una foto destacada vieja
  // podría en teoría llegar por ambas vías si se pagina justo cuando cambia
  // la ventana en vivo).
  const allPhotos = useMemo(() => {
    const byId = new Map<string, PhotoData>()
    for (const p of photos) byId.set(p.id, p)
    for (const p of olderPhotos) byId.set(p.id, p)
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [photos, olderPhotos])

  const feed = useMemo(() => mergeWallFeed(sorted, allPhotos), [sorted, allPhotos])

  const handleDeletePhoto = useCallback(async (photoId: string) => {
    if (!id) return
    await deletePhoto(id, photoId)
  }, [id])

  const handlePinPhoto = useCallback(async (photo: PhotoData) => {
    if (!id) return
    await pinPhoto(id, photo.id, photo.pinned)
  }, [id])

  // Ídem handleReact — el revert optimista de "mi reacción" vive en
  // ReactionPicker, este handler solo dispara la escritura real. Reutiliza
  // reactToPhoto/replyToPhoto (src/firebase/photos.ts), que a su vez
  // comparten motor con los mensajes (ver src/firebase/interactions.ts). Una
  // reacción/respuesta hecha desde una historia (PhotoViewer modo story, vía
  // StoriesBar) actualiza el mismo estado `photos` que la card del feed
  // (para `replies`, que sigue viviendo en `photos` — ver handleReplyPhoto),
  // así que ambas vistas quedan en sync sin lógica extra.
  const handleReactPhoto = useCallback(async (photo: PhotoData, type: ReactionType | null) => {
    if (!id) return
    try {
      await reactToPhoto(id, photo.id, getDeviceToken(), postLabel || 'Invitado', type, postPhotoURL)
    } catch (err) {
      console.error('Error reacting to photo:', err)
      throw err
    }
  }, [id, postLabel, postPhotoURL])

  const handleReplyPhoto = useCallback(async (photo: PhotoData, text: string) => {
    if (!id) return
    await replyToPhoto(id, photo.id, text, postLabel, authorToken, isOwner ? 'owner' : 'guest', postPhotoURL)
  }, [id, postLabel, authorToken, isOwner, postPhotoURL])

  // Estable: sin esto, el arrow function inline que antes se pasaba como
  // onOpen (creado de nuevo por cada foto en cada render del feed) también
  // habría anulado el memo de PhotoFeedCard.
  const openPhoto = useCallback((photo: PhotoData) => {
    setGalleryIndex(allPhotos.findIndex((p) => p.id === photo.id))
  }, [allPhotos])

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
          <Button type="submit" className="w-full font-semibold">
            Entrar al muro
          </Button>
        </form>
      </div>
    )
    return event?.templateId === 'cowboy' || event?.templateId === 'graduation' ? (
      <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="min-h-dvh flex items-center justify-center p-4">
        {nameGateContent}
      </InvitationThemeRoot>
    ) : (
      <div className="min-h-dvh flex items-center justify-center p-4">{nameGateContent}</div>
    )
  }

  const content = (
    <>
      {event?.coverImage && (
        <img src={optimizedImageUrl(event.coverImage, 800)} alt="" loading="eager" fetchPriority="high" crossOrigin="anonymous" className="w-full h-28 object-cover rounded-xl mb-4" />
      )}
      {isOwner && (
        <Link to={`/events/${id}`} className="text-sm text-gray-500 hover:text-primary transition-colors inline-flex items-center gap-1 mb-3">
          <IconArrowLeft className="w-3.5 h-3.5" /> Volver a detalles
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
          photos={allPhotos}
          myToken={getDeviceToken()}
          canReply={!isMinor && !commentBlockedMessage}
          onReact={handleReactPhoto}
          onReply={handleReplyPhoto}
        />
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

      {!canPostWall && (
        <div className="text-sm text-gray-500 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md px-3 py-2 mb-4">
          No tenés permiso para publicar en el muro de este evento.
        </div>
      )}

      {/* Post form */}
      {!isMinor && !commentBlockedMessage && canPostWall && (
        <form onSubmit={handleSubmit} className="invite-wall-form bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-5 space-y-3">
          {!attachedFile && <WallTypeChipSelector value={type} onChange={setType} />}
          <FieldError message={photoBlockedMessage} />
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
            <Button type="submit" size="sm" disabled={posting || (!text.trim() && !attachedFile)}>
              {posting ? 'Publicando…' : 'Publicar'}
            </Button>
          </div>
          <FieldError message={postError} />
        </form>
      )}

      {loading && <p className="text-center text-gray-500 text-sm">Cargando mensajes…</p>}

      {wallError && (
        <p className="text-sm text-red-500 bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 rounded-lg px-3 py-2 mb-4">
          {wallError}
        </p>
      )}

      {!loading && !wallError && feed.length === 0 && (
        <p className="text-center text-gray-500 text-sm py-8">Sé el primero en escribir algo</p>
      )}

      <div className="space-y-3">
        {feed.map((item) => {
          if (item.kind === 'photo') {
            return (
              <PhotoFeedCard
                key={item.id}
                photo={item.photo}
                isOrg={isOrg}
                onOpen={openPhoto}
                onDelete={handleDeletePhoto}
                onPin={handlePinPhoto}
                templateId={event?.templateId}
                eventId={id || ''}
                eventName={event?.name || ''}
                myToken={deviceToken}
                canReply={!isMinor && !commentBlockedMessage}
                onReact={handleReactPhoto}
                onReply={handleReplyPhoto}
              />
            )
          }
          return (
            <WallMessageCard
              key={item.id}
              message={item.message}
              isOrg={isOrg}
              currentUserUid={user?.uid}
              canReply={!isMinor && !commentBlockedMessage}
              templateId={event?.templateId}
              eventId={id || ''}
              eventName={event?.name || ''}
              onPin={handlePin}
              onRequestDelete={setDeletingMessageId}
              onReact={handleReact}
              onReply={handleReply}
            />
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

      {!loading && !wallError && allPhotos.length > 0 && hasMoreOlderPhotos && (
        <div className="text-center mt-2">
          {olderPhotosError && <p className="text-xs text-red-500 mb-2">{olderPhotosError}</p>}
          <button
            onClick={handleLoadOlderPhotos}
            disabled={loadingOlderPhotos}
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-primary font-medium disabled:opacity-50"
          >
            {loadingOlderPhotos ? 'Cargando…' : 'Cargar fotos anteriores'}
          </button>
        </div>
      )}

      {galleryIndex !== null && (
        <PhotoViewer
          photos={allPhotos}
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
    <InvitationThemeRoot templateId={event.templateId} accentOverride={event.accentColor} className="max-w-xl mx-auto px-4 py-6 min-h-dvh">
      {content}
    </InvitationThemeRoot>
  ) : (
    <div className="max-w-xl mx-auto px-4 py-6 min-h-dvh">{content}</div>
  )
}
