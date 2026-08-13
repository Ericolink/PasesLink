import { memo } from 'react'
import type { WaitlistEntryData } from '../../types'
import { IconClock } from '../accessibility/AccessibleIcon'
import { GuestAvatar } from './GuestAvatar'
import { INDICATOR_CLASS } from './guestGrouping'
import { Pill } from './ActionSheetKit'
import { waitingSince } from './waitlistGrouping'

// Misma estructura/clases que GuestRow.tsx (botón real, avatar, nombre,
// subtítulo, punto de indicador) para que la fila se vea como una categoría
// más de la lista de invitados — pero alimentada por WaitlistEntryData, que
// no comparte forma con GuestData (sin companions[], sin RSVP, sin check-in),
// así que no reusa GuestRow directamente.
export const WaitlistEntryRow = memo(function WaitlistEntryRow({
  entry,
  position,
  onOpenDetail,
}: {
  entry: WaitlistEntryData
  position: number
  onOpenDetail: (entry: WaitlistEntryData) => void
}) {
  const isOffered = entry.status === 'offered'
  const subtitle = isOffered ? 'Esperando respuesta' : `Sin lugar confirmado · ${waitingSince(entry.createdAt)}`

  return (
    <div className="relative border-b border-gray-100 dark:border-gray-700">
      <button
        type="button"
        onClick={() => onOpenDetail(entry)}
        className="relative w-full text-left appearance-none bg-white dark:bg-gray-800 flex items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <GuestAvatar guest={{ name: entry.name, lastName: '', isGroup: false, guestPhotoURL: null }} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            <span className="text-gray-400 dark:text-gray-500 font-normal">#{position} </span>
            {entry.name}
            {entry.partySize > 1 && <span className="text-gray-400 dark:text-gray-500 font-normal"> · x{entry.partySize}</span>}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
            <Pill tone={isOffered ? 'amber' : 'violet'} icon={<IconClock className="w-3 h-3" />}>
              {isOffered ? 'OFERTA ENVIADA' : 'EN ESPERA'}
            </Pill>
            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</span>
          </div>
        </div>
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${INDICATOR_CLASS.wait}`} />
      </button>
    </div>
  )
})
