import { useState } from 'react'
import { ReportModal } from './ReportModal'
import { IconFlag } from './Icons'
import type { ReportedContentType } from '../types'

interface Props {
  eventId: string
  eventName: string
  contentType: ReportedContentType
  contentId: string
  contentSnapshot: string
  contentCaption?: string
  contentAuthorName: string
  contentAuthorToken: string
  className?: string
  showLabel?: boolean
}

// Botón discreto de "Reportar" — pensado para vivir junto a Me gusta/No me
// gusta en un mensaje del muro, o junto a "Eliminar foto" en PhotoFeedCard.
// Dueño de su propio estado de modal para que embeberlo en cada lugar sea
// una sola línea, sin que cada caller tenga que manejar open/close.
export function ReportButton({ className, showLabel, ...contentProps }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Reportar contenido"
        title="Reportar"
        className={className || 'wall-action-btn text-xs text-gray-400 hover:text-red-500 transition-colors'}
      >
        <IconFlag className="w-3.5 h-3.5" />
        {showLabel && 'Reportar'}
      </button>
      <ReportModal open={open} onClose={() => setOpen(false)} {...contentProps} />
    </>
  )
}
