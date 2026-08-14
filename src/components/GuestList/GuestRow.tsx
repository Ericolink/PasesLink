import { memo } from 'react'
import { partySize } from '../../firebase/guests'
import type { GuestData } from '../../types'
import { IconCheck } from '../accessibility/AccessibleIcon'
import { GuestAvatar } from './GuestAvatar'
import { INDICATOR_CLASS, getGuestSubtitle, guestDisplayName, guestIndicator } from './guestGrouping'

export const GuestRow = memo(function GuestRow({
  guest,
  requiresPayment,
  ticketPrice,
  currency,
  selectMode,
  selected,
  onToggleSelect,
  onOpenDetail,
}: {
  guest: GuestData
  requiresPayment: boolean
  ticketPrice: number
  currency: string
  selectMode: boolean
  selected: boolean
  onToggleSelect: (guest: GuestData) => void
  onOpenDetail: (guest: GuestData) => void
}) {
  function handleContentClick() {
    if (selectMode) {
      onToggleSelect(guest)
      return
    }
    onOpenDetail(guest)
  }

  const indicator = guestIndicator(guest, requiresPayment)
  const subtitle = getGuestSubtitle(guest, { requiresPayment, ticketPrice, currency })
  const name = guest.isGroup ? guest.name : guestDisplayName(guest)

  return (
    <div className="relative border-b border-gray-100 dark:border-gray-700">
      {/* <button> real (no <div onClick>): es la única forma de abrir el
          detalle de un invitado o alternar su selección — sin esto, un
          usuario de teclado/switch no puede gestionar invitados en absoluto
          desde esta lista. Un <button> es focuseable de forma nativa y
          dispara onClick con Enter/Espacio sin JS extra; `w-full text-left
          appearance-none` deshace los estilos por defecto del navegador para
          que se siga viendo igual que el <div> anterior. */}
      <button
        type="button"
        onClick={handleContentClick}
        aria-pressed={selectMode ? selected : undefined}
        className="relative w-full text-left appearance-none bg-white dark:bg-gray-800 flex items-center gap-3 px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        {selectMode && (
          <div
            aria-hidden="true"
            className={`w-5 h-5 rounded-full border-[1.5px] shrink-0 flex items-center justify-center ${
              selected ? 'bg-primary border-primary text-white' : 'border-gray-300 dark:border-gray-600'
            }`}
          >
            {selected && <IconCheck className="w-3 h-3" />}
          </div>
        )}
        <GuestAvatar guest={guest} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
            {name}
            {guest.isGroup && <span className="text-gray-400 dark:text-gray-500 font-normal"> · x{partySize(guest)}</span>}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{subtitle}</p>
        </div>
        <span aria-hidden="true" className={`w-2.5 h-2.5 rounded-full shrink-0 ${INDICATOR_CLASS[indicator]}`} />
      </button>
    </div>
  )
})
