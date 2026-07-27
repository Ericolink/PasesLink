import { createContext, useContext, useId, useRef, type KeyboardEvent, type ReactNode } from 'react'

// Implementación del patrón "Tabs" del WAI-ARIA APG con activación automática
// (mover el foco con las flechas ya selecciona el tab, sin Enter/Space
// aparte) — encaja con el comportamiento visual que ya tenían los 2 usos
// existentes (AdminDashboard, GuestAddForm): cambiar de sección es
// instantáneo, sin costo de carga que justifique activación manual.
// Reemplaza TabButton.tsx + ScrollableTabs.tsx (mismas clases visuales,
// ahora con role="tablist"/"tab"/"tabpanel", aria-selected/aria-controls e
// ids únicos vía useId).

interface TabsContextValue {
  value: string
  onChange: (value: string) => void
  idBase: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabsContext(component: string): TabsContextValue {
  const ctx = useContext(TabsContext)
  if (!ctx) throw new Error(`<${component}> debe usarse dentro de <Tabs>`)
  return ctx
}

// Genérico en T (union de literales de string, ej. 'events' | 'users') para
// que cada caller conserve su propio tipo de estado sin castear en cada
// onChange — Tab/TabPanel siguen tipados a `string` puro por simplicidad, ya
// que solo comparan/emiten el `value` que el propio caller les pasa.
export function Tabs<T extends string>({
  value,
  onChange,
  children,
}: {
  value: T
  onChange: (value: T) => void
  children: ReactNode
}) {
  const idBase = useId()
  return (
    <TabsContext.Provider value={{ value, onChange: onChange as (value: string) => void, idBase }}>
      {children}
    </TabsContext.Provider>
  )
}

export function TabList({
  children,
  className = '',
  'aria-label': ariaLabel,
}: {
  children: ReactNode
  className?: string
  'aria-label': string
}) {
  const { onChange } = useTabsContext('TabList')
  const listRef = useRef<HTMLDivElement>(null)

  // ArrowLeft/Right/Home/End mueven el foco entre tabs (con wrap) Y
  // seleccionan de inmediato (activación automática) — Tab en sí saca el
  // foco del tablist, nunca cicla entre tabs (roving tabindex: solo el
  // seleccionado tiene tabIndex 0).
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    const tabs = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
    if (tabs.length === 0) return
    const currentIndex = Math.max(0, tabs.findIndex((t) => t === document.activeElement))
    let nextIndex = currentIndex
    if (e.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length
    else if (e.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length
    else if (e.key === 'Home') nextIndex = 0
    else if (e.key === 'End') nextIndex = tabs.length - 1

    e.preventDefault()
    const next = tabs[nextIndex]
    next.focus()
    if (next.dataset.tabValue) onChange(next.dataset.tabValue)
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
      className={`flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  )
}

export function Tab({
  value,
  label,
  count,
  unreadCount,
}: {
  value: string
  label: string
  count?: number
  unreadCount?: number
}) {
  const { value: activeValue, onChange, idBase } = useTabsContext('Tab')
  const active = value === activeValue

  return (
    <button
      type="button"
      role="tab"
      id={`${idBase}-tab-${value}`}
      aria-selected={active}
      aria-controls={`${idBase}-panel-${value}`}
      tabIndex={active ? 0 : -1}
      data-tab-value={value}
      onClick={() => onChange(value)}
      // Activo = tonal pink, no solo el subrayado (Design Memory: "item
      // activo = tonal pink, no fill pleno"). focus-visible propio: TabButton
      // no tenía anillo de foco (gap real, corregido acá).
      className={`shrink-0 whitespace-nowrap min-h-11 px-3 text-sm font-medium border-b-2 -mb-px rounded-t-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
        active
          ? 'border-primary text-primary bg-primary-subtle dark:bg-transparent'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{count}</span>}
      {!!unreadCount && (
        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-2xs font-bold leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}

export function TabPanel({ value, children, className }: { value: string; children: ReactNode; className?: string }) {
  const { value: activeValue, idBase } = useTabsContext('TabPanel')
  if (value !== activeValue) return null

  return (
    <div role="tabpanel" id={`${idBase}-panel-${value}`} aria-labelledby={`${idBase}-tab-${value}`} tabIndex={0} className={className}>
      {children}
    </div>
  )
}
