import type { ReactNode } from 'react'

interface AccessibleTableProps {
  /** Siempre sr-only — un lector de pantalla lo anuncia al entrar a la tabla,
      pero no ocupa espacio visual (el título visible de la sección ya vive
      afuera, en el layout de cada página admin). */
  caption: string
  /** <thead>/<tbody>, igual que en un <table> normal. */
  children: ReactNode
  className?: string
}

// Extrae el <table><caption className="sr-only"> que las 4 tablas admin
// (Users/Reports/Feedback/Events) repetían letra por letra.
export function AccessibleTable({ caption, children, className = '' }: AccessibleTableProps) {
  return (
    <table className={`w-full text-sm ${className}`}>
      <caption className="sr-only">{caption}</caption>
      {children}
    </table>
  )
}

interface SortableThProps {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
  className?: string
}

// Extrae la función `SortableHeader` que AdminUsersTable/AdminFeedbackTable/
// AdminEventsTable repetían de forma idéntica (mismo aria-sort + botón +
// indicador ▲/▼).
export function SortableTh({ label, active, dir, onClick, className = 'px-4 py-2 font-medium' }: SortableThProps) {
  return (
    <th scope="col" className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
        {label}
        {active && <span className="text-2xs">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}
