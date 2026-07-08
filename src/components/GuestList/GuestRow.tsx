import { memo, useRef, useState } from 'react'
import { partySize } from '../../firebase/guests'
import type { GuestData } from '../../types'
import { IconCheck, IconTrash } from '../Icons'
import { GuestAvatar } from './GuestAvatar'
import { getGuestSubtitle, guestDisplayName, guestIndicator } from './guestGrouping'

// A diferencia de PhotoViewer.tsx (swipe de umbral fijo, decide recién en
// touchend), acá el panel de acciones tiene que seguir al dedo en vivo — es
// el gesto de "reveal" tipo WhatsApp/Gmail, no un next/prev de historias.
const SWIPE_MAX_REVEAL_PX = 88
const SWIPE_COMMIT_DISTANCE_PX = 40
const SWIPE_FLICK_VELOCITY_PX_MS = 0.5
const SWIPE_MOVE_THRESHOLD_PX = 8
const SWIPE_SETTLE_TRANSITION = 'transform 240ms cubic-bezier(0.34, 1.56, 0.64, 1)'

// Resistencia tipo rubber-band más allá del ancho de los botones: se puede
// seguir arrastrando pero cada vez cuesta más, en vez de exponer un hueco en
// blanco (los botones tienen ancho fijo) o topar en seco de golpe.
function rubberBand(delta: number, max: number): number {
  const abs = Math.abs(delta)
  if (abs <= max) return delta
  const overflow = abs - max
  const damped = max + overflow / (1 + overflow / max)
  return delta < 0 ? -damped : damped
}

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
  // No-nulo solo mientras el dedo está en pantalla: la fila se renderiza en
  // base a esto (seguimiento 1:1, sin transición) y al soltar vuelve a null
  // para que la posición final la anime `revealed` con transición normal.
  const [dragOffset, setDragOffset] = useState<number | null>(null)
  const startX = useRef<number | null>(null)
  const startY = useRef<number | null>(null)
  const startT = useRef(0)
  const baseOffset = useRef(0)
  const lastX = useRef(0)
  const lastT = useRef(0)
  const moved = useRef(false)
  const horizontal = useRef(false)
  const canQuickPay = requiresPayment && guest.paymentStatus !== 'paid'

  function revealedOffset(state: 'none' | 'pay' | 'delete'): number {
    return state === 'pay' ? SWIPE_MAX_REVEAL_PX : state === 'delete' ? -SWIPE_MAX_REVEAL_PX : 0
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (selectMode) return
    const touch = e.touches[0]
    startX.current = touch.clientX
    startY.current = touch.clientY
    startT.current = Date.now()
    lastX.current = touch.clientX
    lastT.current = startT.current
    baseOffset.current = revealedOffset(revealed)
    moved.current = false
    horizontal.current = false
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (startX.current === null || startY.current === null) return
    const touch = e.touches[0]
    const dx = touch.clientX - startX.current
    const dy = touch.clientY - startY.current
    if (!moved.current) {
      if (Math.abs(dx) < SWIPE_MOVE_THRESHOLD_PX && Math.abs(dy) < SWIPE_MOVE_THRESHOLD_PX) return
      moved.current = true
      horizontal.current = Math.abs(dx) > Math.abs(dy)
    }
    if (!horizontal.current) return
    lastX.current = touch.clientX
    lastT.current = Date.now()
    let next = baseOffset.current + dx
    if (next > 0 && !canQuickPay) next = 0
    setDragOffset(rubberBand(next, SWIPE_MAX_REVEAL_PX))
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (startX.current === null) {
      setDragOffset(null)
      return
    }
    const touch = e.changedTouches[0]
    const dx = touch.clientX - startX.current
    const elapsed = Math.max(1, Date.now() - lastT.current)
    const velocity = (touch.clientX - lastX.current) / elapsed
    startX.current = null
    startY.current = null
    setDragOffset(null)
    if (!moved.current || !horizontal.current) return
    const projected = baseOffset.current + dx
    if (projected <= -SWIPE_COMMIT_DISTANCE_PX || velocity <= -SWIPE_FLICK_VELOCITY_PX_MS) {
      setRevealed('delete')
      return
    }
    if (canQuickPay && (projected >= SWIPE_COMMIT_DISTANCE_PX || velocity >= SWIPE_FLICK_VELOCITY_PX_MS)) {
      setRevealed('pay')
      return
    }
    setRevealed('none')
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
  const offset = dragOffset !== null ? dragOffset : revealedOffset(revealed)
  // La fila no corta en seco arriba del panel de acción — una sombra que
  // crece con el arrastre da la sensación de que se despega/eleva sobre el
  // panel en vez de quedar pegada encima de un bloque de color plano.
  const lift = Math.min(Math.abs(offset) / SWIPE_MAX_REVEAL_PX, 1)

  return (
    <div className="relative border-b border-gray-100 dark:border-gray-700 overflow-hidden">
      <div className="absolute inset-0 flex">
        {canQuickPay && (
          <button
            type="button"
            onClick={() => { onQuickPay(guest); setRevealed('none') }}
            className="w-[88px] h-full bg-green-500 text-white flex flex-col items-center justify-center gap-1 text-xs font-medium"
          >
            <IconCheck className="w-4 h-4" />
            Pagado
          </button>
        )}
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
        className="relative bg-white dark:bg-gray-800 flex items-center gap-3 px-3 py-2.5 cursor-pointer"
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragOffset !== null ? 'none' : `${SWIPE_SETTLE_TRANSITION}, box-shadow 240ms ease-out`,
          boxShadow: lift > 0 ? `0 0 ${16 * lift}px rgba(0, 0, 0, ${0.28 * lift})` : 'none',
        }}
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
