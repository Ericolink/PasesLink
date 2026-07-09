import { useEffect, useMemo, useRef, useState } from 'react'
import { postWallMessage } from '../firebase/wall'
import { addPhoto } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { MAX_UPLOAD_MB, resizeImageForUpload, uploadImage } from '../utils/cloudinary'
import { PHOTO_CAPTION_MAX, WALL_TEXT_MAX } from '../utils/validation'
import { captureException } from '../lib/sentry'
import type { WallMessageType } from '../types'

interface Params {
  eventId: string
  authorName: string
  authorToken: string
  authorRole: 'owner' | 'guest'
  authorPhotoURL?: string
  // Solo WallSection tiene una resolución de identidad distinta entre
  // mensaje y foto (prioriza el guestToken real si está disponible) — si no
  // se pasa, se reusa `authorToken` (caso de EventWall, que ya usaba el
  // mismo token para ambos flujos).
  photoAuthorToken?: string
  isMinor: boolean
  photoBlocked: boolean
  sentryComponent: string
  // Cada superficie del muro decide cómo refrescar su propia lista tras
  // publicar (EventWall tiene listeners en vivo y no necesita hacer nada;
  // WallSection no los tiene y debe volver a pedir los datos).
  onPosted?: () => void
  onPhotoUploaded?: () => void
}

// Compositor único del muro: un mismo textarea sirve para un comentario de
// texto (va a la colección `wall`) o para el mensaje opcional que acompaña
// una foto (va como `caption` a la colección `photos`) — la decisión de a
// cuál de las dos escribir se toma acá, en el submit, según si hay una
// imagen adjunta. Ninguna de las dos colecciones ni sus reglas cambian.
export function useWallComposer({
  eventId, authorName, authorToken, authorRole, authorPhotoURL, photoAuthorToken,
  isMinor, photoBlocked, sentryComponent, onPosted, onPhotoUploaded,
}: Params) {
  const [text, setText] = useState('')
  const [type, setType] = useState<WallMessageType>('comment')
  const [attachedFile, setAttachedFile] = useState<File | null>(null)
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxLength = attachedFile ? PHOTO_CAPTION_MAX : WALL_TEXT_MAX

  const previewUrl = useMemo(() => (attachedFile ? URL.createObjectURL(attachedFile) : null), [attachedFile])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  function openPicker() {
    if (photoBlocked) return
    fileInputRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setError(`La imagen no puede superar los ${MAX_UPLOAD_MB} MB.`)
      return
    }
    setError('')
    setAttachedFile(file)
    setText((prev) => (prev.length > PHOTO_CAPTION_MAX ? prev.slice(0, PHOTO_CAPTION_MAX) : prev))
  }

  function removeImage() {
    setAttachedFile(null)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!eventId || isMinor || posting) return
    if (!text.trim() && !attachedFile) return

    setPosting(true)
    setError('')
    try {
      if (attachedFile) {
        const { blob, width, height } = await resizeImageForUpload(attachedFile)
        const url = await uploadImage(blob)
        await addPhoto(eventId, {
          url,
          authorName,
          authorToken: photoAuthorToken || authorToken,
          caption: text.trim() || undefined,
          width,
          height,
        } as Omit<PhotoData, 'id' | 'createdAt' | 'pinned'>)
        setAttachedFile(null)
        setText('')
        onPhotoUploaded?.()
      } else {
        await postWallMessage(eventId, text, type, authorName, authorToken, authorRole, authorPhotoURL)
        setText('')
        onPosted?.()
      }
    } catch (err) {
      console.error('Error posting to wall:', err)
      captureException(err, { tags: { component: sentryComponent, action: attachedFile ? 'post_photo' : 'post' } })
      setError(err instanceof Error ? err.message : 'No se pudo publicar. Intenta de nuevo.')
    } finally {
      setPosting(false)
    }
  }

  return {
    text, setText, type, setType,
    attachedFile, previewUrl, maxLength,
    posting, error,
    fileInputRef, openPicker, onFileSelected, removeImage,
    handleSubmit,
  }
}
