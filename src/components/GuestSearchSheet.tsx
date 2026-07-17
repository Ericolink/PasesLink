import type { ReactNode } from 'react'
import { IconSearch, IconX } from './Icons'
import { Modal } from './Modal'
import { DialogHeader } from './DialogHeader'
import { Button } from './Button'

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

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        active
          ? 'bg-primary border-primary text-white'
          : 'bg-gray-50 dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
      }`}
    >
      {children}
    </button>
  )
}

export function GuestSearchSheet({
  open,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  sortBy,
  onSortByChange,
  resultCount,
  onClose,
}: {
  open: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: StatusFilter
  onStatusFilterChange: (value: StatusFilter) => void
  sortBy: SortBy
  onSortByChange: (value: SortBy) => void
  resultCount: number
  onClose: () => void
}) {
  const hasActiveFilters = statusFilter !== 'all' || sortBy !== 'newest'

  function clearFilters() {
    onStatusFilterChange('all')
    onSortByChange('newest')
  }

  return (
    <Modal open={open} onClose={onClose} label="Buscar y filtrar invitados" maxWidth="sm:max-w-md">
      <DialogHeader title="Buscar y filtrar" onClose={onClose} />

      <div className="px-5 pb-4 pt-4 overflow-y-auto">
        <div className="relative mb-5">
          <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          {/* Sin autoFocus a propósito: enfocar el input al abrir dispara
              el teclado nativo de inmediato en móvil, tapando los chips de
              filtro antes de que el usuario llegue a verlos. Sin esto, el
              sheet abre con el teclado cerrado y el usuario lo abre solo
              si realmente va a escribir; useModalA11y enfoca el botón
              "Cerrar" como respaldo de accesibilidad, sin disparar teclado. */}
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nombre o apellido…"
            className="w-full border border-gray-200 dark:border-gray-600 rounded-lg pl-9 pr-9 py-2.5 text-sm bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:bg-white dark:focus:bg-gray-800 transition-colors"
          />
          {search && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              aria-label="Limpiar búsqueda"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <IconX className="w-4 h-4" />
            </button>
          )}
        </div>

        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Estado</p>
        <div className="flex flex-wrap gap-2 mb-5">
          {STATUS_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={statusFilter === opt.value} onClick={() => onStatusFilterChange(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>

        <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">Orden</p>
        <div className="flex flex-wrap gap-2">
          {SORT_OPTIONS.map((opt) => (
            <Chip key={opt.value} active={sortBy === opt.value} onClick={() => onSortByChange(opt.value)}>
              {opt.label}
            </Chip>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-gray-100 dark:border-gray-700 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-4 shrink-0">
        <Button type="button" variant="text" onClick={clearFilters} disabled={!hasActiveFilters} className="text-xs">
          Restablecer filtros
        </Button>
        <Button type="button" size="sm" onClick={onClose}>
          Ver {resultCount} {resultCount === 1 ? 'invitado' : 'invitados'}
        </Button>
      </div>
    </Modal>
  )
}
