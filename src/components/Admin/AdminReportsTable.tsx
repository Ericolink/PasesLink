import { useMemo, useState } from 'react'
import type { ContentReport, ReportedContentType, ReportStatus } from '../../types'
import { REPORT_CONTENT_TYPE_LABELS, REPORT_STATUS_LABELS } from '../../types'
import { EmptyState } from '../Empty/EmptyState'
import { IconEye, IconFlag } from '../Icons'
import { ResponsiveTable } from './ResponsiveTable'

const STATUS_PILL_CLASSES: Record<ReportStatus, string> = {
  pending: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  resolved: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  rejected: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

interface Props {
  items: ContentReport[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  statusFilter: ReportStatus | 'all'
  onStatusFilterChange: (value: ReportStatus | 'all') => void
  contentTypeFilter: ReportedContentType | 'all'
  onContentTypeFilterChange: (value: ReportedContentType | 'all') => void
  onOpen: (item: ContentReport) => void
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}

export function AdminReportsTable({
  items,
  loading,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  contentTypeFilter,
  onContentTypeFilterChange,
  onOpen,
  hasMore,
  loadingMore,
  onLoadMore,
}: Props) {
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = items
    if (contentTypeFilter !== 'all') result = result.filter((r) => r.contentType === contentTypeFilter)
    if (q) {
      result = result.filter((r) =>
        r.reason.toLowerCase().includes(q)
        || r.eventName.toLowerCase().includes(q)
        || r.contentAuthorName.toLowerCase().includes(q)
        || r.contentSnapshot.toLowerCase().includes(q),
      )
    }
    return [...result].sort((a, b) => (a.createdAt - b.createdAt) * (sortDir === 'asc' ? 1 : -1))
  }, [items, search, contentTypeFilter, sortDir])

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon={<IconFlag className="w-8 h-8" />}
        title="No hay reportes"
        description="Cuando alguien reporte un comentario o foto del muro, aparecerá aquí."
      />
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Buscar por razón, evento o autor…"
          aria-label="Buscar en reportes"
          className="flex-1 min-w-[180px] border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value as ReportStatus | 'all')}
          aria-label="Filtrar por estado"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(REPORT_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={contentTypeFilter}
          onChange={(e) => onContentTypeFilterChange(e.target.value as ReportedContentType | 'all')}
          aria-label="Filtrar por tipo de contenido"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Comentarios y fotos</option>
          {Object.entries(REPORT_CONTENT_TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        mobile={<>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 animate-pulse space-y-2">
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-2/3" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
            </div>
          ))}
          {!loading && filtered.map((item) => (
            <button
              key={item.id}
              onClick={() => onOpen(item)}
              className="w-full text-left p-4 space-y-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40"
            >
              <div className="flex items-center gap-2">
                <IconFlag className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                <span className="text-gray-900 dark:text-white font-medium break-words">
                  {REPORT_CONTENT_TYPE_LABELS[item.contentType]} de {item.contentAuthorName || 'usuario'}
                </span>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500 break-words">{item.reason}</p>
              <div className="flex items-center gap-2 flex-wrap pt-0.5">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[item.status]}`}>
                  {REPORT_STATUS_LABELS[item.status]}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.eventName}</span>
                <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto shrink-0">
                  {new Date(item.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </button>
          ))}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay reportes que coincidan con la búsqueda.</p>
          )}
        </>}
        table={<>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2 font-medium">Contenido reportado</th>
                <th className="px-4 py-2 font-medium">Evento</th>
                <th className="px-4 py-2 font-medium">Estado</th>
                <th className="px-4 py-2 font-medium" aria-sort={sortDir === 'asc' ? 'ascending' : 'descending'}>
                  <button
                    onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                    className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors"
                  >
                    Fecha
                    <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>
                  </button>
                </th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              {!loading && filtered.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onOpen(item)}
                  className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40"
                >
                  <td className="px-4 py-2 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <IconFlag className="w-3.5 h-3.5 shrink-0 text-gray-400" />
                      <span className="truncate text-gray-900 dark:text-white">
                        {REPORT_CONTENT_TYPE_LABELS[item.contentType]} de {item.contentAuthorName || 'usuario'}
                      </span>
                    </div>
                    <div className="text-xs font-normal text-gray-400 dark:text-gray-500 truncate">{item.reason}</div>
                  </td>
                  <td className="px-4 py-2 font-normal text-gray-600 dark:text-gray-300 max-w-[160px] truncate">{item.eventName}</td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[item.status]}`}>
                      {REPORT_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-normal text-gray-600 dark:text-gray-300">
                    {new Date(item.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpen(item) }}
                      title="Ver reporte"
                      aria-label={`Ver reporte de ${item.contentAuthorName}`}
                      className="text-gray-400 hover:text-primary"
                    >
                      <IconEye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay reportes que coincidan con la búsqueda.</p>
          )}
        </>}
      />

      {hasMore && (
        <div className="text-center py-3 border-t border-gray-100 dark:border-gray-700">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className="text-sm font-medium text-primary hover:text-primary-dark disabled:opacity-50"
          >
            {loadingMore ? 'Cargando…' : 'Cargar más reportes'}
          </button>
        </div>
      )}
    </div>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full max-w-[80px]" />
        </td>
      ))}
    </tr>
  )
}
