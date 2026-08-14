import { useState } from 'react'
import { IconChevronDown } from '../accessibility/AccessibleIcon'

// Paginación de RENDERIZADO, no de datos — ver comentario original en
// GuestList.tsx. Cada sección pagina por separado para no pintar cientos de
// filas a la vez.
export const LIST_SECTION_PAGE_SIZE = 50

export function LoadMoreButton({ remaining, onClick, label = 'invitados' }: { remaining: number; onClick: () => void; label?: string }) {
  return (
    <button onClick={onClick} className="w-full text-sm text-primary font-medium py-2.5 hover:underline">
      Cargar más {label} ({remaining} restantes)
    </button>
  )
}

export type ListSectionTone = 'amber' | 'violet' | 'gray'

const TITLE_TONE_CLASS: Record<ListSectionTone, string> = {
  amber: 'text-amber-600 dark:text-amber-400',
  violet: 'text-violet-600 dark:text-violet-400',
  gray: 'text-gray-400 dark:text-gray-500',
}

// Bloque de sección genérico (título colapsable + badge de conteo + lista
// bordeada + "Cargar más") — usado tanto por GuestList (secciones de
// urgencia sobre GuestData) como por WaitlistPanel (una sola sección sobre
// WaitlistEntryData). No conoce el tipo de item: quien lo usa arma cada fila
// con `renderItem`, incluyendo su propio `key`.
export function ListSection<T>({
  title,
  titleTone = 'gray',
  alwaysExpanded,
  collapsedByDefault,
  items,
  renderItem,
  pageSize = LIST_SECTION_PAGE_SIZE,
  loadMoreLabel,
  hideCount = false,
}: {
  title: string
  titleTone?: ListSectionTone
  alwaysExpanded: boolean
  collapsedByDefault: boolean
  items: T[]
  renderItem: (item: T) => React.ReactNode
  pageSize?: number
  loadMoreLabel?: string
  // GuestList ya muestra este mismo número, más grande, en el resumen de
  // MetricTile de arriba (ver GuestList.tsx) — mostrarlo también acá era
  // literal duplicación. Se mantiene disponible (default false) porque
  // WaitlistPanel no tiene ese resumen: su único "Lista de espera" mezcla
  // waiting+offered, un total que ningún MetricTile de arriba repite. El
  // conteo sigue anunciándose por lectura de pantalla vía aria-label aunque
  // no se muestre — ocultarlo visualmente no debe borrar la información
  // para quien no ve el resumen de arriba.
  hideCount?: boolean
}) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault)
  const [visibleCount, setVisibleCount] = useState(pageSize)

  if (items.length === 0) return null
  const expanded = alwaysExpanded || !collapsed
  const visible = items.slice(0, visibleCount)
  const countLabel = `${items.length} invitado${items.length === 1 ? '' : 's'}`

  return (
    <div>
      <h3 className="contents">
        <button
          type="button"
          onClick={() => !alwaysExpanded && setCollapsed((c) => !c)}
          aria-label={`${title}, ${countLabel}${alwaysExpanded ? '' : collapsed ? ', colapsado' : ', expandido'}`}
          className={`w-full flex items-center justify-between gap-2 px-1 py-2 ${alwaysExpanded ? 'cursor-default' : ''}`}
        >
          <span aria-hidden="true" className={`text-xs font-bold uppercase tracking-wide ${TITLE_TONE_CLASS[titleTone]}`}>{title}</span>
          <span aria-hidden="true" className="flex items-center gap-1.5">
            {!hideCount && (
              <span className="text-xs font-semibold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700 rounded-full px-2 py-0.5">
                {items.length}
              </span>
            )}
            {!alwaysExpanded && (
              <IconChevronDown className={`w-3.5 h-3.5 text-gray-400 dark:text-gray-500 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
            )}
          </span>
        </button>
      </h3>
      {expanded && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          {visible.map((item) => renderItem(item))}
          {items.length > visibleCount && (
            <LoadMoreButton remaining={items.length - visibleCount} onClick={() => setVisibleCount((c) => c + pageSize)} label={loadMoreLabel} />
          )}
        </div>
      )}
    </div>
  )
}
