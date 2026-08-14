import { useId, useRef, useState } from 'react'
import { IconChevronDown, IconSearch, IconX } from './accessibility/AccessibleIcon'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { FilterChip } from './FilterChip'

type StatusFilter = 'all' | 'confirmed' | 'scanned' | 'declined' | 'pending'
type SortBy = 'newest' | 'oldest' | 'az' | 'za'

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'scanned', label: 'Ya escaneados' },
  { value: 'declined', label: 'No asistirán' },
  { value: 'pending', label: 'Pendientes' },
]

const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: 'newest', label: 'Más nuevos' },
  { value: 'oldest', label: 'Más antiguos' },
  { value: 'az', label: 'A–Z' },
  { value: 'za', label: 'Z–A' },
]

const STATUS_LABEL = Object.fromEntries(STATUS_OPTIONS.map((o) => [o.value, o.label])) as Record<StatusFilter, string>
const SORT_LABEL = Object.fromEntries(SORT_OPTIONS.map((o) => [o.value, o.label])) as Record<SortBy, string>

// Reemplaza el botón que abría GuestSearchSheet (modal de pantalla completa)
// por un input siempre visible + un panel de filtros desplegable inline —
// buscar ya no requiere abrir nada. `search`/`statusFilter`/`sortBy` siguen
// viviendo en EventDetail.tsx; este componente es puramente de presentación.
export function GuestSearchBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
}: {
  search: string
  onSearchChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
}) {
  const [filtersOpen, setFiltersOpen] = useState(false)
  const panelId = useId()
  const filtersButtonRef = useRef<HTMLButtonElement>(null)
  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (sortBy !== 'newest' ? 1 : 0)
  const hasActiveFilters = activeFilterCount > 0

  function clearFilters() {
    onStatusFilterChange('all')
    onSortByChange('newest')
  }

  function closeFilters() {
    setFiltersOpen(false)
    filtersButtonRef.current?.focus()
  }

  return (
    <div className="mb-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {/* Sin autoFocus: a diferencia del sheet anterior (que abría con un
              click explícito), este input ya está en pantalla apenas se
              entra a la sección — enfocarlo solo abriría el teclado nativo
              en móvil sin que el usuario lo haya pedido. */}
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && search) onSearchChange('')
            }}
            placeholder="Buscar invitado…"
            aria-label="Buscar invitado por nombre o apellido"
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg pl-9 pr-9 py-2.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
          />
          {search && (
            // p-1.5 (no el min-w-11/44px de IconButton): vive dentro de un
            // input de una sola línea con solo pr-9 (36px) reservados para
            // el ícono — 44px de ancho invadiría el texto escrito. 16px de
            // ícono + 6px de padding por lado = 28×28, ya cumple el mínimo
            // real de WCAG 2.5.8 AA (24×24).
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          ref={filtersButtonRef}
          type="button"
          onClick={() => setFiltersOpen((open) => !open)}
          aria-expanded={filtersOpen}
          aria-controls={panelId}
          className="shrink-0 flex items-center justify-center gap-1.5 border border-gray-200 dark:border-gray-600 rounded-lg px-3.5 py-2.5 text-sm font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500 focus:outline-none focus:ring-2 focus:ring-primary transition-colors"
        >
          Filtros
          {hasActiveFilters && (
            <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-2xs font-semibold">
              {activeFilterCount}
            </span>
          )}
          <IconChevronDown className={`w-4 h-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* Chips de filtros activos: visibles siempre que haya alguno, con o
          sin el panel abierto — así se ve de un vistazo por qué la lista de
          abajo no muestra a todos sin tener que reabrir "Filtros". */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-2 mt-2.5">
          {statusFilter !== 'all' && (
            <ActiveFilterPill label={STATUS_LABEL[statusFilter]} onRemove={() => onStatusFilterChange('all')} />
          )}
          {sortBy !== 'newest' && (
            <ActiveFilterPill label={SORT_LABEL[sortBy]} onRemove={() => onSortByChange('newest')} />
          )}
        </div>
      )}

      {filtersOpen && (
        // Delegación de teclado: el foco real vive en los FilterChip/botones
        // de adentro, este div solo escucha el Esc que burbujea desde ellos
        // para cerrar el panel (mismo criterio que AccessibleAccordion).
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions
        <div
          id={panelId}
          onKeyDown={(e) => {
            if (e.key === 'Escape') closeFilters()
          }}
          className="border border-gray-200 dark:border-gray-600 rounded-lg p-4 mt-2.5"
        >
          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Estado</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {STATUS_OPTIONS.map((opt) => (
              <FilterChip key={opt.value} active={statusFilter === opt.value} onClick={() => onStatusFilterChange(opt.value)}>
                {opt.label}
              </FilterChip>
            ))}
          </div>

          <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Orden</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {SORT_OPTIONS.map((opt) => (
              <FilterChip key={opt.value} active={sortBy === opt.value} onClick={() => onSortByChange(opt.value)}>
                {opt.label}
              </FilterChip>
            ))}
          </div>

          <div className="flex justify-end">
            <AccessibleButton type="button" variant="text" onClick={clearFilters} disabled={!hasActiveFilters} className="text-xs">
              Limpiar filtros
            </AccessibleButton>
          </div>
        </div>
      )}
    </div>
  )
}

function ActiveFilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      onClick={onRemove}
      aria-label={`${label} (quitar filtro)`}
      className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
    >
      {label}
      <IconX className="w-3 h-3" />
    </button>
  )
}
