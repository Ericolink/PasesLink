import { useEffect, useMemo, useRef, useState } from 'react'
import type { EventData } from '../../types'
import { buildEventShareCard } from '../../utils/share/buildEventShareCard'
import { renderShareCardImage } from '../../utils/share/renderShareCardImage'
import { shareEventCard } from '../../utils/share/shareEngine'
import { EventShareCardTemplate } from './EventShareCardTemplate'
import { ShareFallbackSheet } from './ShareFallbackSheet'
import { IconInstagram } from '../Icons'

// Punto de entrada para difundir el evento en redes (organizador, hoy;
// GuestPass podrá montar el mismo componente más adelante sin cambios acá).
// Solo tiene sentido cuando existe un link público de auto-registro — el
// padre ya gatea el render con `event.entryMode !== 'list'`.
export function ShareEventButton({ event }: { event: EventData }) {
  const joinUrl = `${window.location.origin}/events/${event.id}/join`
  const content = useMemo(() => buildEventShareCard(event, joinUrl), [event, joinUrl])

  const cardNodeRef = useRef<HTMLDivElement>(null)
  const [imageBlob, setImageBlob] = useState<Blob | null>(null)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    if (!imageBlob) {
      setImageUrl(null)
      return
    }
    const url = URL.createObjectURL(imageBlob)
    setImageUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [imageBlob])

  // La imagen se genera una sola vez (perezosamente, en el primer click) y se
  // reutiliza tanto para el share nativo como para la hoja de respaldo.
  async function ensureImage(): Promise<Blob | null> {
    if (imageBlob) return imageBlob
    if (!cardNodeRef.current) return null
    const blob = await renderShareCardImage(cardNodeRef.current)
    if (blob) setImageBlob(blob)
    return blob
  }

  async function handleShare() {
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
    await ensureImage()
    setSheetOpen(true)
  }

  return (
    <>
      <EventShareCardTemplate content={content} nodeRef={cardNodeRef} />

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

      <ShareFallbackSheet open={sheetOpen} content={content} imageUrl={imageUrl} onClose={() => setSheetOpen(false)} />
    </>
  )
}
