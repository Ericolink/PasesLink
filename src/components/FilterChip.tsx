import type { ReactNode } from 'react'

// Extraído de GuestSearchSheet.tsx (era un componente local ahí) — archivo
// compartido para el botón-pill de filtros en vez de duplicarlo en cada
// pantalla que necesite el mismo patrón.
export function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
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
