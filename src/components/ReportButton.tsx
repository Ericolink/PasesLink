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
//
// Auditoría de escalabilidad (F15): ReportModal monta useUserProfile() (un
// onSnapshot propio sobre users/{uid}, sin caché compartida) — este botón
// vive UNO POR CARD dentro de un feed (EventWall.tsx/WallSection.tsx), así
// que montar el modal sin condición significaba abrir un listener redundante
// por cada mensaje/foto visible, además del que la propia pantalla ya tiene
// para el mismo documento. Se monta recién cuando `open` es true — nadie
// reporta más de un item a la vez, así que esto baja el fan-out de N
// listeners siempre activos a 0 o 1, solo mientras el modal está abierto.
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
      {open && <ReportModal open={open} onClose={() => setOpen(false)} {...contentProps} />}
    </>
  )
}
