import { memo, useRef, useState } from 'react'
import { partySize } from '../../firebase/guests'
import type { GuestData } from '../../types'
import { IconCheck, IconTrash } from '../Icons'
import { GuestAvatar } from './GuestAvatar'
import { getGuestSubtitle, guestDisplayName, guestIndicator } from './guestGrouping'

// Mismo patrón táctil que PhotoViewer.tsx (touchstart/touchend con refs +
// umbral en constante) en vez de pointer-capture nuevo, para no introducir
// una segunda forma de manejar gestos en el proyecto.
const SWIPE_REVEAL_PX = 44
const SWIPE_MOVE_THRESHOLD_PX = 8

const INDICATOR_CLASS: Record<string, string> = {
  action: 'bg-amber-500',
  ok: 'bg-green-500',
  off: 'bg-gray-300 dark:bg-gray-600',
  wait: 'border-[1.5px] border-violet-400 dark:border-violet-500 bg-transparent',
}

export const GuestRow = memo(function GuestRow({
  guest,
  requiresPayment,
  ticketPrice,
  currency,
  selectMode,
  selected,
  onToggleSelect,
  onOpenDetail,
  onQuickPay,
  onQuickDeleteRequest,
}: {
  guest: GuestData
  requiresPayment: boolean
  ticketPrice: number
  currency: string
  selectMode: boolean
  selected: boolean
  onToggleSelect: (guest: GuestData) => void
  onOpenDetail: (guest: GuestData) => void
  onQuickPay: (guest: GuestData) => void
  onQuickDeleteRequest: (guest: GuestData) => void
}) {
  const [revealed, setRevealed] = useState<'none' | 'pay' | 'delete'>('none')
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const moved = useRef(false)
  const canQuickPay = requiresPayment && guest.paymentStatus !== 'paid'

  function handleTouchStart(e: React.TouchEvent) {
    if (selectMode) return
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    moved.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (Math.abs(dx) > SWIPE_MOVE_THRESHOLD_PX || Math.abs(dy) > SWIPE_MOVE_THRESHOLD_PX) moved.current = true
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return
    const dx = e.changedTouches[0].clientX - startX.current
    const dy = e.changedTouches[0].clientY - startY.current
    startX.current = null
    startY.current = null
    if (!moved.current) return
    if (Math.abs(dy) > Math.abs(dx)) return
    if (dx < -SWIPE_REVEAL_PX) setRevealed('delete')
    else if (dx > SWIPE_REVEAL_PX && canQuickPay) setRevealed('pay')
    else setRevealed('none')
  }

  function handleContentClick() {
    if (selectMode) {
      onToggleSelect(guest)
      return
    }
    if (revealed !== 'none') {
      setRevealed('none')
      return
    }
    onOpenDetail(guest)
  }

  const indicator = guestIndicator(guest, requiresPayment)
  const subtitle = getGuestSubtitle(guest, { requiresPayment, ticketPrice, currency })
  const name = guest.isGroup ? guest.name : guestDisplayName(guest)

  return (
    <div className="relative border-b border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="absolute inset-0 flex">
        <button
          type="button"
          onClick={() => { onQuickPay(guest); setRevealed('none') }}
          className="w-[88px] h-full bg-green-500 text-white flex flex-col items-center justify-center gap-1 text-xs font-medium"
        >
          <IconCheck className="w-4 h-4" />
          Pagado
        </button>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => { onQuickDeleteRequest(guest); setRevealed('none') }}
          className="w-[88px] h-full bg-red-500 text-white flex flex-col items-center justify-center gap-1 text-xs font-medium"
        >
          <IconTrash className="w-4 h-4" />
          Eliminar
        </button>
      </div>

      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleContentClick}
        className="relative bg-white dark:bg-gray-800 flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-transform duration-200 ease-out"
        style={{ transform: `translateX(${revealed === 'pay' ? 88 : revealed === 'delete' ? -88 : 0}px)` }}
      >
        {selectMode && (
          <div
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
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${INDICATOR_CLASS[indicator]}`} />
      </div>
    </div>
  )
})
