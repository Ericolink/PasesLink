import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PhotoData } from '../firebase/photos'
import { optimizedImageUrl } from '../utils/cloudinary'
import { useScrollLock } from '../hooks/useScrollLock'
import { IconX, IconArrowLeft } from './Icons'
import { ProgressiveImage } from './ProgressiveImage'

// Ancho de la versión servida en el visor: de sobra para llenar la pantalla
// incluso en retina, sin cargar el original completo (varios MB) por cada
// foto — importante con eventos que acumulan cientos de fotos.
const VIEWER_IMAGE_WIDTH = 1200
const STORY_DURATION_MS = 5000
const SWIPE_THRESHOLD_PX = 50
const SWIPE_DOWN_CLOSE_PX = 90

interface Props {
  photos: PhotoData[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
  mode: 'story' | 'gallery'
  isOrg?: boolean
  onDelete?: (photoId: string) => void
  // Invocado cada vez que cambia la foto visible (mount + avance/retroceso).
  // Usado en modo story para marcar como "vista" al autor correspondiente.
  onView?: (photo: PhotoData) => void
}

// Visor fullscreen compartido: reemplaza el antiguo PhotoLightbox (grid de
// fotos del muro) y el visor que antes vivía embebido en StoriesBar.
// Edge-to-edge real a propósito (sin rounded-xl, sin padding lateral en la
// imagen) — el contenedor siempre ocupa toda la pantalla, así que una foto
// vertical y una horizontal se ven igual de "resueltas" en vez de que una
// quede chica con bordes negros y la otra casi llene la pantalla.
export function PhotoViewer({ photos, index, onIndexChange, onClose, mode, isOrg, onDelete, onView }: Props) {
  const [progress, setProgress] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  // Estado del avance automático de historias, separado de React state para
  // no reprogramar el rAF en cada render: `pausedRef` se apaga/enciende al
  // mantener presionada la imagen (como IG/WhatsApp) sin perder el progreso
  // ya acumulado (`elapsedRef` guarda lo corrido antes de la pausa actual).
  const pausedRef = useRef(false)
  const startRef = useRef(Date.now())
  const elapsedRef = useRef(0)
  const photo = photos[index]
  const isStory = mode === 'story'

  function pauseStory() {
    if (!isStory || pausedRef.current) return
    elapsedRef.current += Date.now() - startRef.current
    pausedRef.current = true
  }

  function resumeStory() {
    if (!isStory || !pausedRef.current) return
    startRef.current = Date.now()
    pausedRef.current = false
  }

  useEffect(() => {
    if (photo) onView?.(photo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?.id])

  function goPrev() {
    onIndexChange(Math.max(0, index - 1))
  }

  function goNext() {
    if (index < photos.length - 1) onIndexChange(index + 1)
    else if (isStory) onClose()
  }

  // Auto-advance solo en modo story — respeta pauseStory()/resumeStory()
  // (ver comentario junto a esos refs) en vez de asumir que corre siempre.
  useEffect(() => {
    if (!isStory) return
    setProgress(0)
    elapsedRef.current = 0
    pausedRef.current = false
    startRef.current = Date.now()
    const frame = requestAnimationFrame(function tick() {
      if (!pausedRef.current) {
        const elapsed = elapsedRef.current + (Date.now() - startRef.current)
        const pct = Math.min(100, (elapsed / STORY_DURATION_MS) * 100)
        setProgress(pct)
        if (pct >= 100) {
          if (index < photos.length - 1) onIndexChange(index + 1)
          else onClose()
          return
        }
      }
      requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isStory, index, photos.length])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') goPrev()
      if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length])

  useScrollLock(true)

  if (!photo) return null

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
    pauseStory()
  }

  function handleTouchEnd(e: React.TouchEvent) {
    resumeStory()
    if (touchStartX.current === null || touchStartY.current === null) return
    const deltaX = e.changedTouches[0].clientX - touchStartX.current
    const deltaY = e.changedTouches[0].clientY - touchStartY.current
    touchStartX.current = null
    touchStartY.current = null
    // Swipe hacia abajo predominante → cerrar (mismo gesto que IG/WhatsApp),
    // antes solo se podía cerrar con el botón X pequeño de la esquina.
    if (deltaY > SWIPE_DOWN_CLOSE_PX && Math.abs(deltaY) > Math.abs(deltaX)) {
      onClose()
      return
    }
    if (deltaX > SWIPE_THRESHOLD_PX) goPrev()
    else if (deltaX < -SWIPE_THRESHOLD_PX) goNext()
  }

  // Portal a document.body: montado in-place, este `fixed inset-0` quedaba a
  // veces mal posicionado porque GuestPass/EventWall envuelven el muro en
  // InvitationThemeRoot, que aplica una clase de entrada con `transform`
  // (fade-in-up/bounce-in/slide-in-up, fill-mode `both`) al contenedor padre.
  // Un ancestro con `transform` distinto de `none` pasa a ser el containing
  // block de sus descendientes `position: fixed` (spec CSS), así que el
  // visor terminaba posicionado contra el alto de toda la página en vez del
  // viewport — de ahí el fondo oscurecido "bien" pero la imagen desplazada
  // hacia abajo, visible solo haciendo scroll. Portaling saca el visor de ese
  // subárbol por completo, así que es inmune a cualquier transform/filter
  // que un wrapper de tema (actual o futuro) le ponga a sus ancestros.
  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={isStory ? undefined : onClose}
    >
      {/* Progress bars — solo story */}
      {isStory && (
        <div className="flex gap-1 px-3 pt-3">
          {photos.map((_, i) => (
            <div key={i} className="h-0.5 flex-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,.3)' }}>
              <div
                className="h-full rounded-full transition-none"
                style={{ background: '#fff', width: i < index ? '100%' : i === index ? `${progress}%` : '0%' }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2" onClick={(e) => e.stopPropagation()}>
        <span className="text-white text-sm font-medium">
          {isStory ? photo.authorName : `${index + 1} / ${photos.length}`}
        </span>
        <button onClick={onClose} className="text-white/70 hover:text-white p-1" aria-label="Cerrar">
          <IconX className="w-5 h-5" />
        </button>
      </div>

      {/* Image */}
      <div
        className="flex-1 relative flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <ProgressiveImage
          src={optimizedImageUrl(photo.url, VIEWER_IMAGE_WIDTH)}
          alt={photo.caption || `Foto de ${photo.authorName}`}
          loading="eager"
          className="max-h-full max-w-full w-full h-full"
          imgClassName="object-contain"
        />

        {isStory ? (
          <>
            {/* Tap zones: prev / next */}
            <button className="absolute left-0 top-0 w-1/3 h-full" onClick={goPrev} aria-label="Anterior" />
            <button className="absolute right-0 top-0 w-1/3 h-full" onClick={goNext} aria-label="Siguiente" />
          </>
        ) : (
          <>
            {index > 0 && (
              <button
                className="absolute left-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 transition-colors"
                onClick={(e) => { e.stopPropagation(); goPrev() }}
                aria-label="Anterior"
              >
                <IconArrowLeft className="w-5 h-5" />
              </button>
            )}
            {index < photos.length - 1 && (
              <button
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/80 hover:text-white p-2 rounded-full bg-black/40 transition-colors rotate-180"
                onClick={(e) => { e.stopPropagation(); goNext() }}
                aria-label="Siguiente"
              >
                <IconArrowLeft className="w-5 h-5" />
              </button>
            )}
          </>
        )}

        {/* Nav arrows en desktop, solo story (gallery ya las muestra siempre arriba) */}
        {isStory && index > 0 && (
          <button
            className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white"
            onClick={(e) => { e.stopPropagation(); goPrev() }}
          >
            <IconArrowLeft className="w-4 h-4" />
          </button>
        )}
        {isStory && index < photos.length - 1 && (
          <button
            className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-black/40 text-white rotate-180"
            onClick={(e) => { e.stopPropagation(); goNext() }}
          >
            <IconArrowLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Caption / footer */}
      <div className="text-center pb-6 px-6" onClick={(e) => e.stopPropagation()}>
        {photo.caption && <p className="text-white/80 text-sm mb-1">{photo.caption}</p>}
        {!isStory && <p className="text-white/50 text-xs">{photo.authorName}</p>}
        {!isStory && isOrg && onDelete && (
          <button
            onClick={() => { onDelete(photo.id); onClose() }}
            className="mt-2 text-xs text-red-400 hover:text-red-300 underline"
          >
            Eliminar foto
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
