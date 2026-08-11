import { createContext, useContext, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { IconChevronDown } from '../AccessibleIcon'

// Implementación del patrón "Accordion" del WAI-ARIA APG (secciones con
// show/hide) — hermano de AccessibleTabs/Tabs.tsx (mismo criterio: contexto +
// useId() + delegación de teclado en el contenedor), pero sin selección
// exclusiva por defecto: varias secciones pueden estar abiertas a la vez
// (allowMultipleExpanded), a diferencia de un tablist. No existía ningún
// acordeón accesible en el proyecto — FaqAccordion.tsx usaba <details> nativo
// sin aria-expanded/aria-controls.

interface AccordionContextValue {
  isExpanded: (id: string, defaultExpanded: boolean) => boolean
  toggle: (id: string, defaultExpanded: boolean) => void
  idBase: string
}

const AccordionContext = createContext<AccordionContextValue | null>(null)

function useAccordionContext(component: string): AccordionContextValue {
  const ctx = useContext(AccordionContext)
  if (!ctx) throw new Error(`<${component}> debe usarse dentro de <Accordion>`)
  return ctx
}

export function Accordion({
  allowMultipleExpanded = true,
  children,
  className = '',
}: {
  allowMultipleExpanded?: boolean
  children: ReactNode
  className?: string
}) {
  const idBase = useId()
  const containerRef = useRef<HTMLDivElement>(null)

  // Modo multi-expandido: solo se guardan los ids que el usuario tocó
  // explícitamente (no hace falta "registrar" de antemano la lista completa
  // de items, que puede variar porque los módulos hijos pueden devolver
  // null) — el resto sigue su propio defaultExpanded.
  const [explicit, setExplicit] = useState<Record<string, boolean>>({})
  // Modo single-expanded (allowMultipleExpanded=false): un solo id activo.
  // null = "todavía nadie tocó nada, usar el defaultExpanded del primer item
  // que lo declare" — responsabilidad del caller no declarar más de un
  // defaultExpanded en este modo.
  const [activeId, setActiveId] = useState<string | null>(null)

  function isExpanded(id: string, defaultExpanded: boolean): boolean {
    if (!allowMultipleExpanded) return activeId === null ? defaultExpanded : activeId === id
    return explicit[id] ?? defaultExpanded
  }

  function toggle(id: string, defaultExpanded: boolean) {
    if (!allowMultipleExpanded) {
      setActiveId((prev) => {
        const current = prev === null ? (defaultExpanded ? id : null) : prev
        return current === id ? null : id
      })
      return
    }
    setExplicit((prev) => ({ ...prev, [id]: !isExpanded(id, defaultExpanded) }))
  }

  // ArrowDown/ArrowUp/Home/End mueven el foco entre los headers de ESTE
  // acordeón (con wrap) — recomendado por el APG, opcional sobre Enter/Space
  // que ya alcanzan (son <button> nativos). Filtra por data-accordion-root
  // para no capturar headers de un acordeón anidado (ej. preguntas de FAQ
  // dentro de una fila del panel) que comparten el mismo DOM subtree.
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return
    const headers = Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[data-accordion-header]') ?? []).filter(
      (el) => el.dataset.accordionRoot === idBase,
    )
    if (headers.length === 0) return
    const currentIndex = Math.max(0, headers.findIndex((h) => h === document.activeElement))
    let nextIndex = currentIndex
    if (e.key === 'ArrowDown') nextIndex = (currentIndex + 1) % headers.length
    else if (e.key === 'ArrowUp') nextIndex = (currentIndex - 1 + headers.length) % headers.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = headers.length - 1

    e.preventDefault()
    headers[nextIndex].focus()
  }

  return (
    <AccordionContext.Provider value={{ isExpanded, toggle, idBase }}>
      {/* Delegación de teclado (ver handleKeyDown) sobre un contenedor que
          nunca es foco en sí mismo — el foco real vive siempre en los
          botones-header de cada AccordionItem, este div solo escucha las
          flechas que burbujean desde ellos (patrón de composite widget del
          APG, mismo criterio que AccessibleTabs/Tabs.tsx). */}
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
      <div ref={containerRef} onKeyDown={handleKeyDown} className={className}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

export function AccordionItem({
  id,
  header,
  defaultExpanded = false,
  headingLevel = 3,
  className = '',
  children,
}: {
  id: string
  header: ReactNode
  defaultExpanded?: boolean
  headingLevel?: 2 | 3 | 4 | 5 | 6
  className?: string
  children: ReactNode
}) {
  const { isExpanded, toggle, idBase } = useAccordionContext('AccordionItem')
  const expanded = isExpanded(id, defaultExpanded)
  const buttonId = `${idBase}-header-${id}`
  const panelId = `${idBase}-panel-${id}`
  const HeadingTag = `h${headingLevel}` as const

  // El contenido solo se monta una vez que la sección se abrió por primera
  // vez (y se queda montado después, para poder animar el cierre con el
  // truco grid-template-rows sin volver a pagar el costo de render) — así
  // los módulos costosos (mapas, clima, FAQs extensas) nunca renderizan si
  // el invitado no llegó a abrirlos. setState condicional durante el render
  // (no en un efecto): es el patrón que React documenta para "ajustar
  // estado cuando cambia un valor" — React descarta el render en curso y
  // vuelve a renderizar antes de pintar, sin el round-trip extra de un
  // useEffect ni el error de mutar un ref durante el render.
  const [hasOpened, setHasOpened] = useState(expanded)
  if (expanded && !hasOpened) setHasOpened(true)

  return (
    <div className={`a11y-accordion-item ${className}`}>
      <HeadingTag className="a11y-accordion-heading">
        <button
          type="button"
          id={buttonId}
          aria-expanded={expanded}
          aria-controls={panelId}
          data-accordion-header
          data-accordion-root={idBase}
          onClick={() => toggle(id, defaultExpanded)}
          className="w-full flex items-center justify-between gap-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-md"
        >
          {header}
          <IconChevronDown
            className={`w-4 h-4 shrink-0 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </HeadingTag>
      <div className="a11y-accordion-collapse" data-open={expanded}>
        <div id={panelId} role="region" aria-labelledby={buttonId}>
          {hasOpened && children}
        </div>
      </div>
    </div>
  )
}
