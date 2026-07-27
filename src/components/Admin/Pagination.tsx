import { useEffect } from 'react'
import { useAnnouncer } from '../../contexts/AnnouncementContext'

interface Props {
  page: number
  pageCount: number
  totalItems: number
  pageSize: number
  onPageChange: (page: number) => void
}

// Un solo componente compartido por las 4 tablas admin — anunciar acá el
// conteo/página cubre de una vez tanto el recálculo por filtro/búsqueda
// (L-4) como el cambio de página (L-5), que hasta ahora eran completamente
// silenciosos para lectores de pantalla. Debounce de 400ms: `totalItems`
// cambia en cada tecla mientras se escribe en el buscador, y anunciar cada
// una saturaría al lector de pantalla.
export function Pagination({ page, pageCount, totalItems, pageSize, onPageChange }: Props) {
  const { announce } = useAnnouncer()
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalItems)

  useEffect(() => {
    const timeout = setTimeout(() => {
      announce(
        totalItems === 0
          ? 'Sin resultados'
          : `${start}–${end} de ${totalItems} resultados, página ${page} de ${pageCount}`,
      )
    }, 400)
    return () => clearTimeout(timeout)
  }, [start, end, totalItems, page, pageCount, announce])

  if (totalItems === 0) return null

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 dark:border-gray-700 text-sm">
      <p className="text-gray-500 dark:text-gray-400">
        {start}–{end} de {totalItems.toLocaleString('es-MX')}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          className="min-w-11 min-h-11 px-2.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Página anterior"
        >
          ←
        </button>
        <span className="text-gray-500 dark:text-gray-400 text-xs px-1">
          Página {page} de {pageCount}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= pageCount}
          className="min-w-11 min-h-11 px-2.5 rounded-md border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          aria-label="Página siguiente"
        >
          →
        </button>
      </div>
    </div>
  )
}
