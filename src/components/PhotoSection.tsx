import { useCallback, useEffect, useRef, useState } from 'react'
import { addPhoto, deletePhoto, fetchPhotos } from '../firebase/photos'
import type { PhotoData } from '../firebase/photos'
import { uploadImage, optimizedImageUrl } from '../utils/cloudinary'
import { PhotoLightbox } from './PhotoLightbox'
import { IconCamera, IconX } from './Icons'

const MAX_CAPTION = 120
const MAX_FILE_MB = 8

interface Props {
  eventId: string
  guestName: string
  guestToken: string
  isOrg?: boolean
  templateId?: string
}

export function PhotoSection({ eventId, guestName, guestToken, isOrg = false }: Props) {
  const [photos, setPhotos] = useState<PhotoData[]>([])
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [caption, setCaption] = useState('')
  const [showCaptionFor, setShowCaptionFor] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const loadPhotos = useCallback(() => {
    fetchPhotos(eventId).then(setPhotos).catch(() => {})
  }, [eventId])

  useEffect(() => {
    loadPhotos()
  }, [loadPhotos])

  function openPicker() {
    fileRef.current?.click()
  }

  function onFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setUploadError(`La foto no puede superar los ${MAX_FILE_MB} MB.`)
      return
    }
    setUploadError('')
    setCaption('')
    setShowCaptionFor(file)
  }

  async function confirmUpload() {
    if (!showCaptionFor) return
    setShowCaptionFor(null)
    setUploading(true)
    setUploadError('')
    try {
      const url = await uploadImage(showCaptionFor)
      await addPhoto(eventId, {
        url,
        authorName: guestName,
        authorToken: guestToken,
        caption: caption.trim() || undefined,
      })
      loadPhotos()
    } catch {
      setUploadError('No se pudo subir la foto. Intenta de nuevo.')
    } finally {
      setUploading(false)
      setCaption('')
    }
  }

  async function handleDelete(photoId: string) {
    await deletePhoto(eventId, photoId)
    loadPhotos()
  }

  return (
    <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--invite-border)' }}>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-[var(--invite-text)]">
          Fotos del evento
          {photos.length > 0 && (
            <span className="ml-1.5 text-xs text-[var(--invite-text-muted)] font-normal">
              ({photos.length})
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={loadPhotos}
            className="text-xs text-[var(--invite-text-muted)] hover:text-[var(--invite-text)] transition-colors"
            title="Actualizar fotos"
          >
            ↻
          </button>
          <button
            onClick={openPicker}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-opacity hover:opacity-80 disabled:opacity-40"
            style={{ background: 'var(--invite-accent)', color: '#fff' }}
          >
            <IconCamera className="w-3.5 h-3.5" />
            {uploading ? 'Subiendo…' : '+ Foto'}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFileSelected} />
      </div>

      {uploadError && (
        <p className="text-xs text-red-500 mb-3">{uploadError}</p>
      )}

      {/* Caption modal */}
      {showCaptionFor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div
            className="w-full max-w-sm rounded-2xl p-5 space-y-3"
            style={{ background: 'var(--invite-surface)', border: '1px solid var(--invite-border)' }}
          >
            <p className="text-sm font-semibold text-[var(--invite-text)]">¿Querés agregar un pie de foto?</p>
            <input
              type="text"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={MAX_CAPTION}
              placeholder="Opcional…"
              className="w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2"
              style={{
                background: 'var(--invite-bg)',
                borderColor: 'var(--invite-border)',
                color: 'var(--invite-text)',
              }}
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowCaptionFor(null)}
                className="flex-1 text-sm py-2 rounded-lg border transition-opacity hover:opacity-70"
                style={{ borderColor: 'var(--invite-border)', color: 'var(--invite-text-muted)' }}
              >
                Cancelar
              </button>
              <button
                onClick={confirmUpload}
                className="flex-1 text-sm py-2 rounded-lg font-medium transition-opacity hover:opacity-80 text-white"
                style={{ background: 'var(--invite-accent)' }}
              >
                Subir foto
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Gallery grid */}
      {photos.length === 0 ? (
        <div
          className="rounded-xl py-8 text-center border-2 border-dashed"
          style={{ borderColor: 'var(--invite-border)' }}
        >
          <IconCamera className="w-7 h-7 mx-auto mb-2 text-[var(--invite-text-muted)]" />
          <p className="text-sm text-[var(--invite-text-muted)]">Sé el primero en subir una foto</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-1.5">
          {photos.map((photo, i) => (
            <div
              key={photo.id}
              className="relative aspect-square rounded-lg overflow-hidden cursor-pointer group"
              onClick={() => setLightboxIndex(i)}
            >
              <img
                src={optimizedImageUrl(photo.url, 200)}
                alt={photo.caption || `Foto de ${photo.authorName}`}
                className="w-full h-full object-cover transition-transform duration-200 group-hover:scale-105"
                loading="lazy"
              />
              {isOrg && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(photo.id) }}
                  className="absolute top-1 right-1 p-0.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Eliminar"
                >
                  <IconX className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <PhotoLightbox
          photos={photos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onPrev={() => setLightboxIndex((i) => Math.max(0, (i ?? 0) - 1))}
          onNext={() => setLightboxIndex((i) => Math.min(photos.length - 1, (i ?? 0) + 1))}
          isOrg={isOrg}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
