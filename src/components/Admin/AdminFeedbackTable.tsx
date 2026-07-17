import { useMemo, useState } from 'react'
import type { Feedback, FeedbackCategory, FeedbackPriority, FeedbackStatus } from '../../types'
import { FEEDBACK_CATEGORY_LABELS, FEEDBACK_PRIORITY_LABELS, FEEDBACK_STATUS_LABELS } from '../../types'
import { EmptyState } from '../Empty/EmptyState'
import { FeedbackCategoryIcon } from '../FeedbackCategoryIcon'
import { IconEye, IconInbox, IconStar, IconTrash } from '../Icons'
import { Pagination } from './Pagination'
import { ResponsiveTable } from './ResponsiveTable'
import { SkeletonBlock } from '../Skeleton'

const STATUS_PILL_CLASSES: Record<FeedbackStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800',
  planned: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800',
  resolved: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  closed: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

const PRIORITY_PILL_CLASSES: Record<FeedbackPriority, string> = {
  low: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
  normal: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800',
  high: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800',
  urgent: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
}

type SortKey = 'createdAt' | 'status' | 'priority'

const PAGE_SIZE = 20

interface Props {
  items: Feedback[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  onOpen: (item: Feedback) => void
  onToggleFavorite: (item: Feedback) => void
  onRequestDelete: (item: Feedback) => void
}

export function AdminFeedbackTable({ items, loading, search, onSearchChange, onOpen, onToggleFavorite, onRequestDelete }: Props) {
  const [categoryFilter, setCategoryFilter] = useState<FeedbackCategory | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<FeedbackStatus | 'all'>('all')
  const [priorityFilter, setPriorityFilter] = useState<FeedbackPriority | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = items
    if (categoryFilter !== 'all') result = result.filter((f) => f.category === categoryFilter)
    if (statusFilter !== 'all') result = result.filter((f) => f.status === statusFilter)
    if (priorityFilter !== 'all') result = result.filter((f) => f.priority === priorityFilter)
    if (q) {
      result = result.filter((f) =>
        f.subject.toLowerCase().includes(q)
        || f.message.toLowerCase().includes(q)
        || (f.userEmail || '').toLowerCase().includes(q)
        || (f.userDisplayName || '').toLowerCase().includes(q),
      )
    }
    const sorted = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'createdAt') return (a.createdAt - b.createdAt) * dir
      return a[sortKey].localeCompare(b[sortKey]) * dir
    })
    return sorted
  }, [items, search, categoryFilter, statusFilter, priorityFilter, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'createdAt' ? 'desc' : 'asc')
    }
  }

  if (!loading && items.length === 0) {
    return (
      <EmptyState
        icon={IconInbox}
        title="El buzón está vacío"
        description="Cuando alguien envíe una sugerencia, error o comentario, aparecerá aquí."
      />
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
        <input
          type="search"
          value={search}
          onChange={(e) => { onSearchChange(e.target.value); setPage(1) }}
          placeholder="Buscar por asunto, mensaje o remitente…"
          aria-label="Buscar en el buzón"
          className="flex-1 min-w-[180px] border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value as FeedbackCategory | 'all'); setPage(1) }}
          aria-label="Filtrar por categoría"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todas las categorías</option>
          {Object.entries(FEEDBACK_CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as FeedbackStatus | 'all'); setPage(1) }}
          aria-label="Filtrar por estado"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(FEEDBACK_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <select
          value={priorityFilter}
          onChange={(e) => { setPriorityFilter(e.target.value as FeedbackPriority | 'all'); setPage(1) }}
          aria-label="Filtrar por prioridad"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todas las prioridades</option>
          {Object.entries(FEEDBACK_PRIORITY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>

      <ResponsiveTable
        mobile={<>
          {loading && Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-4 space-y-2">
              <SkeletonBlock className="h-3 w-2/3" />
              <SkeletonBlock className="h-3 w-1/3" />
            </div>
          ))}
          {!loading && pageItems.map((item) => (
            <div
              key={item.id}
              onClick={() => onOpen(item)}
              className="p-4 space-y-1.5 cursor-pointer active:bg-gray-50 dark:active:bg-gray-700/40"
            >
              <div className="flex items-start gap-2">
                {!item.read && <span className="mt-1.5 block w-2 h-2 rounded-full bg-primary shrink-0" title="No leído" />}
                <FeedbackCategoryIcon category={item.category} className="w-4 h-4 shrink-0 text-gray-400 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className={`text-gray-900 dark:text-white break-words ${!item.read ? 'font-semibold' : 'font-medium'}`}>{item.subject}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.message}</p>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {item.userEmail || item.userDisplayName || (item.userId ? 'Usuario registrado' : 'Anónimo')}
              </p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[item.status]}`}>
                  {FEEDBACK_STATUS_LABELS[item.status]}
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${PRIORITY_PILL_CLASSES[item.priority]}`}>
                  {FEEDBACK_PRIORITY_LABELS[item.priority]}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {new Date(item.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                </span>
                <div className="flex items-center gap-1 -my-2 -mx-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); onToggleFavorite(item) }}
                    title={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                    aria-label={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                    className={`min-w-11 min-h-11 inline-flex items-center justify-center ${item.favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}`}
                  >
                    <IconStar className="w-4 h-4" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onRequestDelete(item) }}
                    title="Eliminar"
                    aria-label={`Eliminar ${item.subject}`}
                    className="min-w-11 min-h-11 inline-flex items-center justify-center text-gray-400 hover:text-red-600"
                  >
                    <IconTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!loading && pageItems.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay mensajes que coincidan con la búsqueda.</p>
          )}
        </>}
        table={<>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
                <th className="px-4 py-2 font-medium w-8"></th>
                <th className="px-4 py-2 font-medium">Asunto</th>
                <th className="px-4 py-2 font-medium">Remitente</th>
                <SortableHeader label="Estado" active={sortKey === 'status'} dir={sortDir} onClick={() => toggleSort('status')} />
                <SortableHeader label="Prioridad" active={sortKey === 'priority'} dir={sortDir} onClick={() => toggleSort('priority')} />
                <SortableHeader label="Fecha" active={sortKey === 'createdAt'} dir={sortDir} onClick={() => toggleSort('createdAt')} />
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
              {!loading && pageItems.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => onOpen(item)}
                  className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/40 ${!item.read ? 'font-semibold' : ''}`}
                >
                  <td className="px-4 py-2">
                    {!item.read && <span className="block w-2 h-2 rounded-full bg-primary" title="No leído" />}
                  </td>
                  <td className="px-4 py-2 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <FeedbackCategoryIcon category={item.category} className="w-4 h-4 shrink-0 text-gray-400" />
                      <span className="truncate text-gray-900 dark:text-white">{item.subject}</span>
                    </div>
                    <div className="text-xs font-normal text-gray-400 dark:text-gray-500 truncate">{item.message}</div>
                  </td>
                  <td className="px-4 py-2 font-normal text-gray-600 dark:text-gray-300">
                    {item.userEmail || item.userDisplayName || (item.userId ? 'Usuario registrado' : 'Anónimo')}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[item.status]}`}>
                      {FEEDBACK_STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${PRIORITY_PILL_CLASSES[item.priority]}`}>
                      {FEEDBACK_PRIORITY_LABELS[item.priority]}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-normal text-gray-600 dark:text-gray-300">
                    {new Date(item.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      <button
                        onClick={(e) => { e.stopPropagation(); onToggleFavorite(item) }}
                        title={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        aria-label={item.favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
                        className={item.favorite ? 'text-amber-500' : 'text-gray-300 hover:text-amber-500'}
                      >
                        <IconStar className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onOpen(item) }}
                        title="Ver mensaje completo"
                        aria-label={`Ver mensaje de ${item.subject}`}
                        className="text-gray-400 hover:text-primary"
                      >
                        <IconEye className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); onRequestDelete(item) }}
                        title="Eliminar"
                        aria-label={`Eliminar ${item.subject}`}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <IconTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && pageItems.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay mensajes que coincidan con la búsqueda.</p>
          )}
        </>}
      />

      <Pagination page={currentPage} pageCount={pageCount} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}

function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="px-4 py-2 font-medium" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
        {label}
        {active && <span className="text-2xs">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <SkeletonBlock className="h-3 w-full max-w-[80px]" />
        </td>
      ))}
    </tr>
  )
}
