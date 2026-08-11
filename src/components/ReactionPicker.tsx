import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { IconChevronDown, IconThumbsUp } from './accessibility/AccessibleIcon'
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
  // El botón "Más reacciones" (único camino por teclado hacia el menú — ver
  // más abajo) necesita recuperar el foco al cerrar el menú por teclado
  // (Escape o al elegir una reacción), igual que un menú-botón estándar.
  const moreButtonRef = useRef<HTMLButtonElement>(null)
  // Distingue "se abrió por teclado" (mover foco al menú, como pide el
  // patrón Menu Button del APG) de "se abrió por hover/long-press" (mover el
  // foco ahí sería robárselo a un usuario de mouse/touch sin motivo).
  const openedViaKeyboardRef = useRef(false)

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
      if (e.key === 'Escape') {
        setPickerOpen(false)
        // Devuelve el foco al trigger — sin esto, cerrar con Escape deja el
        // foco en un botón que acaba de desmontarse (el navegador lo manda
        // a <body>, sin equivalente para un lector de pantalla).
        moreButtonRef.current?.focus()
      }
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

  // Foco al menú SOLO cuando se abrió por teclado (botón "Más reacciones")
  // — abrir por hover/long-press no debe robarle el foco a un usuario de
  // mouse/touch que ni siquiera lo está usando.
  useEffect(() => {
    if (!pickerOpen || !openedViaKeyboardRef.current) return
    openedViaKeyboardRef.current = false
    const popup = containerRef.current?.querySelector<HTMLElement>('.reaction-popup')
    ;(popup?.querySelector<HTMLElement>('[tabindex="0"]') ?? popup?.querySelector<HTMLElement>('[role="menuitemradio"]'))?.focus()
  }, [pickerOpen])

  // ArrowUp/Down/Left/Right + Home/End navegan entre las reacciones del menú
  // (patrón Menu del APG) — Escape ya lo maneja el listener de arriba.
  function handlePopupKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    const items = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'))
    if (items.length === 0) return
    const currentIndex = Math.max(0, items.findIndex((i) => i === document.activeElement))
    let nextIndex = currentIndex
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % items.length
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + items.length) % items.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = items.length - 1
    e.preventDefault()
    items[nextIndex].focus()
  }

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
    moreButtonRef.current?.focus()
  }

  function handleMainClick() {
    if (pickerOpen) return
    void react(mine ? null : 'like')
  }

  function openPickerViaKeyboard() {
    openedViaKeyboardRef.current = true
    setPickerOpen((v) => !v)
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
        // tabIndex={-1}: el foco nunca va al contenedor del menú en sí (ver
        // el efecto de arriba, que siempre enfoca un menuitem puntual) — el
        // roving tabindex vive en los botones de abajo. Solo declara
        // explícitamente que este nodo participa del sistema de foco, para
        // que la regla de a11y no lo confunda con un <div> decorativo sin
        // ninguna forma de alcanzarlo por teclado.
        <div className="reaction-popup" role="menu" aria-label="Elegir reacción" tabIndex={-1} onKeyDown={handlePopupKeyDown}>
          {REACTIONS.map((r, i) => (
            <button
              key={r.type}
              type="button"
              // menuitemradio/aria-checked (no menuitem/aria-pressed): las
              // reacciones son mutuamente excluyentes entre sí — el
              // equivalente ARIA correcto de un grupo de opciones dentro de
              // un menú, aunque acá se permita "des-elegir" tocando de nuevo
              // la misma (algo que un radio nativo no deja hacer).
              role="menuitemradio"
              title={r.label}
              aria-label={r.label}
              aria-checked={mine === r.type}
              // Roving tabindex: un solo detenimiento en el orden de
              // tabulación (la reacción activa, o la primera si no hay
              // ninguna) — el resto se alcanza con las flechas, no con Tab.
              tabIndex={(mine ? mine === r.type : i === 0) ? 0 : -1}
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

      {/* Único trigger que abre el menú de forma operable por teclado — el
          botón principal solo alterna la reacción por defecto (like), y el
          hover/long-press (arriba) siguen abriendo el menú para mouse/touch
          sin pasar por acá. */}
      <button
        ref={moreButtonRef}
        type="button"
        className="reaction-more-btn"
        aria-label="Más reacciones"
        aria-haspopup="menu"
        aria-expanded={pickerOpen}
        onClick={openPickerViaKeyboard}
      >
        <IconChevronDown className="w-3.5 h-3.5 rotate-180" />
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
