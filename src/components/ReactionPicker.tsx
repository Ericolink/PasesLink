import { useEffect, useMemo, useRef, useState } from 'react'
import { IconThumbsUp } from './Icons'
import { ReactionListSheet } from './ReactionListSheet'
import { REACTIONS, REACTION_BY_TYPE } from '../utils/reactions'
import type { ReactionType, WallReaction } from '../types'

const HOVER_OPEN_DELAY_MS = 400
const LONG_PRESS_DELAY_MS = 400

interface Props {
  reactions: Record<string, WallReaction>
  myToken: string
  onReact: (type: ReactionType | null) => void
}

export function ReactionPicker({ reactions, myToken, onReact }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  // Única pista visual de que "mantener presionado" hace algo distinto a tocar
  // en touch (sin hover no hay ninguna otra señal): el botón se encoge y se
  // llena de color durante los LONG_PRESS_DELAY_MS del press, vía CSS
  // (.reaction-main-btn[data-pressing]) sincronizado a esa misma constante.
  const [pressing, setPressing] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const mine = reactions[myToken]?.type ?? null

  const { total, top } = useMemo(() => {
    const counts = new Map<ReactionType, number>()
    for (const r of Object.values(reactions)) counts.set(r.type, (counts.get(r.type) || 0) + 1)
    const top = REACTIONS.filter((r) => counts.has(r.type)).sort(
      (a, b) => (counts.get(b.type) || 0) - (counts.get(a.type) || 0),
    )
    return { total: Object.values(reactions).length, top }
  }, [reactions])

  const namesByType = useMemo(() => {
    const map = new Map<ReactionType, string[]>()
    for (const r of Object.values(reactions)) {
      const list = map.get(r.type) || []
      list.push(r.name)
      map.set(r.type, list)
    }
    return map
  }, [reactions])

  useEffect(() => {
    if (!pickerOpen) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setPickerOpen(false)
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setPickerOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [pickerOpen])

  useEffect(() => () => {
    clearTimeout(hoverTimer.current)
    clearTimeout(pressTimer.current)
  }, [])

  function scheduleOpen(timerRef: typeof hoverTimer, delay: number) {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setPickerOpen(true), delay)
  }

  function choose(type: ReactionType) {
    onReact(mine === type ? null : type)
    setPickerOpen(false)
  }

  function handleMainClick() {
    if (pickerOpen) return
    onReact(mine ? null : 'like')
  }

  const mineConfig = mine ? REACTION_BY_TYPE.get(mine) : undefined

  const summaryTitle = top
    .map((r) => `${r.emoji} ${(namesByType.get(r.type) || []).join(', ')}`)
    .join('  •  ')

  return (
    <div
      ref={containerRef}
      className="reaction-widget relative flex items-center gap-1.5"
      onMouseEnter={() => scheduleOpen(hoverTimer, HOVER_OPEN_DELAY_MS)}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setPickerOpen(false) }}
    >
      {pickerOpen && (
        <div className="reaction-popup" role="menu">
          {REACTIONS.map((r, i) => (
            <button
              key={r.type}
              type="button"
              role="menuitem"
              title={r.label}
              aria-label={r.label}
              aria-pressed={mine === r.type}
              className="reaction-popup-emoji"
              style={{ animationDelay: `${i * 25}ms` }}
              onClick={() => choose(r.type)}
            >
              {r.emoji}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handleMainClick}
        onTouchStart={() => { setPressing(true); scheduleOpen(pressTimer, LONG_PRESS_DELAY_MS) }}
        onTouchEnd={() => { setPressing(false); clearTimeout(pressTimer.current) }}
        onTouchCancel={() => { setPressing(false); clearTimeout(pressTimer.current) }}
        onContextMenu={(e) => e.preventDefault()}
        aria-label={mineConfig ? `Reacción: ${mineConfig.label}` : 'Reaccionar'}
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        data-active={!!mine}
        data-pressing={pressing}
        className="reaction-main-btn"
      >
        {mineConfig ? (
          <span className="reaction-main-emoji" aria-hidden="true">{mineConfig.emoji}</span>
        ) : (
          <IconThumbsUp className="w-4 h-4" />
        )}
        <span>{mineConfig ? mineConfig.label : 'Me gusta'}</span>
      </button>

      {total > 0 && (
        <button
          type="button"
          className="reaction-summary"
          title={summaryTitle}
          aria-label={`Ver quién reaccionó (${total})`}
          onClick={() => setListOpen(true)}
        >
          <span aria-hidden="true">{top.slice(0, 3).map((r) => r.emoji).join('')}</span>
          {total}
        </button>
      )}

      {listOpen && <ReactionListSheet reactions={reactions} onClose={() => setListOpen(false)} />}
    </div>
  )
}
