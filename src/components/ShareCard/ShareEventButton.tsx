import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventData } from '../../types'
import { buildEventShareCard } from '../../utils/share/buildEventShareCard'
import { renderShareCardImage } from '../../utils/share/renderShareCardImage'
import { shareEventCard } from '../../utils/share/shareEngine'
import { EventShareCardTemplate } from './EventShareCardTemplate'
import { ShareFallbackSheet } from './ShareFallbackSheet'
import { Toast } from '../Toast'
import { IconInstagram } from '../Icons'

// Punto de entrada para difundir el evento en redes (organizador, hoy;
// GuestPass podrá montar el mismo componente más adelante sin cambios acá).
// Solo tiene sentido cuando existe un link público de auto-registro — el
// padre ya gatea el render con `event.entryMode !== 'list'`.
export function ShareEventButton({ event }: { event: EventData }) {
  // Ruta corta (/e/:id, ver App.tsx) en vez de /events/:id/join — mismo
  // destino (EventJoin), solo un alias más legible dentro de la imagen y al
  // copiarse al portapapeles.
  const joinUrl = `${window.location.origin}/e/${event.id}`
  const content = useMemo(() => buildEventShareCard(event, joinUrl), [event, joinUrl])

  const cardNodeRef = useRef<HTMLDivElement>(null)
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null)
  const [pending, setPending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [showCopyToast, setShowCopyToast] = useState(false)

  // El object URL se crea junto con el blob (en ensureImage) y no en un
  // efecto: así el efecto solo libera el URL anterior al reemplazarlo o al
  // desmontar, sin disparar un re-render adicional con setState.
  useEffect(() => {
    return () => {
      if (image) URL.revokeObjectURL(image.url)
    }
  }, [image])

  // La imagen se genera una sola vez (perezosamente, en el primer click) y se
  // reutiliza tanto para el share nativo como para la hoja de respaldo.
  async function ensureImage(): Promise<Blob | null> {
    if (image) return image.blob
    if (!cardNodeRef.current) return null
    const blob = await renderShareCardImage(cardNodeRef.current, content.theme.accentDark)
    if (blob) setImage({ blob, url: URL.createObjectURL(blob) })
    return blob
  }

  // Instagram no vuelve tappable ningún link "horneado" en la imagen (ni en
  // Stories subida desde carrete ni en DM) — solo su Link Sticker nativo lo
  // logra. Copiar el link al portapapeles al iniciar el share deja al
  // invitado listo para pegarlo ahí si decide agregarlo manualmente. Sin
  // await: no debe demorar el gesto de usuario que navigator.share() necesita
  // para no perder la ventana de user-activation en navegadores móviles.
  // Falla en silencio: "Copiar enlace" en ShareFallbackSheet sigue siendo la
  // vía manual de respaldo.
  function copyLinkQuietly() {
    navigator.clipboard
      ?.writeText(content.url)
      .then(() => {
        setShowCopyToast(true)
        setTimeout(() => setShowCopyToast(false), 2500)
      })
      .catch(() => {})
  }

  async function handleShare() {
    copyLinkQuietly()
    setPending(true)
    try {
      const blob = await ensureImage()
      const result = await shareEventCard(content, blob)
      if (result === 'unsupported') setSheetOpen(true)
    } finally {
      setPending(false)
    }
  }

  async function handleMoreOptions() {
    copyLinkQuietly()
    await ensureImage()
    setSheetOpen(true)
  }

  return (
    <>
      <EventShareCardTemplate content={content} templateId={event.templateId} nodeRef={cardNodeRef} />

      <div className="flex items-center gap-3 flex-wrap mb-3">
        <button
          type="button"
          onClick={handleShare}
          disabled={pending}
          className="inline-flex items-center gap-2 text-white rounded-xl px-4 py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-60 transition-opacity bg-gradient-to-r from-[#833AB4] via-[#E1306C] to-[#F77737]"
        >
          <IconInstagram className="w-4 h-4" />
          {pending ? 'Generando…' : 'Compartir evento'}
        </button>
        <button
          type="button"
          onClick={handleMoreOptions}
          className="text-xs text-primary font-medium hover:underline"
        >
          Más opciones para compartir
        </button>
      </div>

      {showCopyToast && (
        <Toast message="Enlace copiado" onDismiss={() => setShowCopyToast(false)} />
      )}

      <ShareFallbackSheet open={sheetOpen} content={content} imageUrl={image?.url ?? null} onClose={() => setSheetOpen(false)} />
    </>
  )
}
