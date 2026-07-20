import { useEffect, useMemo, useRef, useState } from 'react'
import { IconThumbsUp } from './Icons'
import { ReactionListSheet } from './ReactionListSheet'
import { REACTIONS, REACTION_BY_TYPE, getMyReaction, setMyReaction } from '../utils/reactions'
import type { InteractiveCollection } from '../firebase/interactions'
import type { ReactionType } from '../types'

const HOVER_OPEN_DELAY_MS = 400
const LONG_PRESS_DELAY_MS = 400

interface Props {
  eventId: string
  collectionName: InteractiveCollection
  docId: string
  // Denormalizados (auditoría F2/F11) en vez del mapa `reactions` completo,
  // que se dejó de escribir — ver interactions.ts. El costo de render de
  // este componente (resumen + tooltip) ya no depende de cuántas
  // reacciones tenga el mensaje/foto.
  reactionCount: number
  reactionCountsByType: Partial<Record<ReactionType, number>>
  onReact: (type: ReactionType | null) => void | Promise<void>
}

export function ReactionPicker({ eventId, collectionName, docId, reactionCount, reactionCountsByType, onReact }: Props) {
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

  // "Mi reacción" ya no viene del mapa `reactions` del mensaje/foto (ver
  // utils/reactions.ts) — se guarda por dispositivo en localStorage, igual
  // que el propio device token. Sin useEffect para re-leerla si cambia
  // `docId`: cada card vive detrás de un `key={item.id}` en el feed (ver
  // EventWall.tsx/WallSection.tsx), así que un docId distinto siempre
  // implica un montaje nuevo de este componente — el inicializador de
  // useState ya corre de nuevo solo.
  const [mine, setMine] = useState<ReactionType | null>(() => getMyReaction(docId))

  const top = useMemo(
    () => REACTIONS.filter((r) => (reactionCountsByType[r.type] || 0) > 0)
      .sort((a, b) => (reactionCountsByType[b.type] || 0) - (reactionCountsByType[a.type] || 0)),
    [reactionCountsByType],
  )

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

  // Optimista: refleja el cambio en `mine` (y en localStorage) antes de que
  // Firestore confirme, y revierte si la escritura falla — mismo criterio
  // que ya usaban EventWall.tsx/WallSection.tsx sobre el mapa `reactions`
  // (ahora ese revert vive acá, junto con el estado que representa).
  async function react(type: ReactionType | null) {
    const prev = mine
    setMine(type)
    setMyReaction(docId, type)
    try {
      await onReact(type)
    } catch {
      setMine(prev)
      setMyReaction(docId, prev)
    }
  }

  function choose(type: ReactionType) {
    void react(mine === type ? null : type)
    setPickerOpen(false)
  }

  function handleMainClick() {
    if (pickerOpen) return
    void react(mine ? null : 'like')
  }

  const mineConfig = mine ? REACTION_BY_TYPE.get(mine) : undefined

  // Antes listaba los NOMBRES de quién reaccionó (requería el mapa
  // `reactions` completo en memoria). Con reactionCountsByType denormalizado
  // ya no hay nombres disponibles sin una lectura aparte — el tooltip pasa a
  // mostrar el desglose por tipo (ej. "👍 12 · ❤️ 5"); la lista de nombres
  // completa sigue disponible al tocar el contador (ReactionListSheet, con
  // fetch a la subcolección).
  const summaryTitle = top
    .map((r) => `${r.emoji} ${reactionCountsByType[r.type] || 0}`)
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

      {reactionCount > 0 && (
        <button
          type="button"
          className="reaction-summary"
          title={summaryTitle}
          aria-label={`Ver quién reaccionó (${reactionCount})`}
          onClick={() => setListOpen(true)}
        >
          <span aria-hidden="true">{top.slice(0, 3).map((r) => r.emoji).join('')}</span>
          {reactionCount}
        </button>
      )}

      {listOpen && (
        <ReactionListSheet
          eventId={eventId}
          collectionName={collectionName}
          docId={docId}
          total={reactionCount}
          countsByType={reactionCountsByType}
          onClose={() => setListOpen(false)}
        />
      )}
    </div>
  )
}
