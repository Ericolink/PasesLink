import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AdminUser } from '../../firebase/admin'
import type { EventData, EventStatus } from '../../types'
import { EmptyState } from '../Empty/EmptyState'
import { IconCalendar, IconDownload, IconEye, IconBarChart2, IconTrash } from '../Icons'
import { Pagination } from './Pagination'

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

const STATUS_PILL_CLASSES: Record<EventStatus, string> = {
  active: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800',
  cancelled: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800',
  archived: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:border-gray-600',
}

type SortKey = 'name' | 'date' | 'guestCount' | 'checkedInCount'

const PAGE_SIZE = 20

interface Props {
  events: EventData[]
  usersById: Map<string, AdminUser>
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  onStatusChange: (eventId: string, status: EventStatus) => void
  onRequestDelete: (event: EventData) => void
  onRequestBulkAction: (events: EventData[], action: 'archive' | 'cancel' | 'delete') => void
}

export function AdminEventsTable({ events, usersById, loading, search, onSearchChange, onStatusChange, onRequestDelete, onRequestBulkAction }: Props) {
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    let result = events
    if (statusFilter !== 'all') result = result.filter((e) => e.status === statusFilter)
    if (q) {
      result = result.filter((e) => {
        const ownerEmail = usersById.get(e.ownerId)?.email?.toLowerCase() || ''
        return e.name.toLowerCase().includes(q) || e.location.toLowerCase().includes(q) || ownerEmail.includes(q)
      })
    }
    const sorted = [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'name') return a.name.localeCompare(b.name) * dir
      if (sortKey === 'date') return a.date.localeCompare(b.date) * dir
      return (a[sortKey] - b[sortKey]) * dir
    })
    return sorted
  }, [events, usersById, search, statusFilter, sortKey, sortDir])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(key === 'date' ? 'desc' : 'asc')
    }
  }

  function toggleSelectAllOnPage() {
    setSelected((prev) => {
      const next = new Set(prev)
      const allSelected = pageItems.every((e) => next.has(e.id))
      for (const e of pageItems) {
        if (allSelected) next.delete(e.id)
        else next.add(e.id)
      }
      return next
    })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exportCsv() {
    const rows = [['Evento', 'Fecha', 'Organizador', 'Estado', 'Invitados', 'Check-ins']]
    for (const e of filtered) {
      rows.push([
        e.name,
        e.date,
        usersById.get(e.ownerId)?.email || e.ownerId,
        STATUS_LABELS[e.status],
        String(e.guestCount),
        String(e.checkedInCount),
      ])
    }
    downloadCsv(rows, 'paselink_eventos.csv')
  }

  const selectedEvents = events.filter((e) => selected.has(e.id))
  const allOnPageSelected = pageItems.length > 0 && pageItems.every((e) => selected.has(e.id))

  if (!loading && events.length === 0) {
    return (
      <EmptyState
        icon={<IconCalendar className="w-8 h-8" />}
        title="Aún no hay eventos"
        description="Cuando los organizadores creen eventos, aparecerán aquí."
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
          placeholder="Buscar por evento, lugar u organizador…"
          aria-label="Buscar eventos"
          className="flex-1 min-w-[180px] border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as EventStatus | 'all'); setPage(1) }}
          aria-label="Filtrar por estado"
          className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-2 py-1.5"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <IconDownload className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border-b border-primary/20 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-200">{selected.size} seleccionados</span>
          <button onClick={() => onRequestBulkAction(selectedEvents, 'archive')} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium">
            Archivar
          </button>
          <button onClick={() => onRequestBulkAction(selectedEvents, 'cancel')} className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white font-medium">
            Cancelar
          </button>
          <button onClick={() => onRequestBulkAction(selectedEvents, 'delete')} className="text-red-600 hover:text-red-700 font-medium">
            Eliminar
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            Cancelar selección
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <th className="px-4 py-2 font-medium w-8">
                <input
                  type="checkbox"
                  checked={allOnPageSelected}
                  onChange={toggleSelectAllOnPage}
                  aria-label="Seleccionar todos los eventos de esta página"
                />
              </th>
              <SortableHeader label="Evento" active={sortKey === 'name'} dir={sortDir} onClick={() => toggleSort('name')} />
              <SortableHeader label="Fecha" active={sortKey === 'date'} dir={sortDir} onClick={() => toggleSort('date')} />
              <th className="px-4 py-2 font-medium">Organizador</th>
              <th className="px-4 py-2 font-medium">Estado</th>
              <SortableHeader label="Invitados" active={sortKey === 'guestCount'} dir={sortDir} onClick={() => toggleSort('guestCount')} />
              <SortableHeader label="Check-ins" active={sortKey === 'checkedInCount'} dir={sortDir} onClick={() => toggleSort('checkedInCount')} />
              <th className="px-4 py-2 font-medium"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading && Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
            {!loading && pageItems.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-2">
                  <input type="checkbox" checked={selected.has(event.id)} onChange={() => toggleSelect(event.id)} aria-label={`Seleccionar ${event.name}`} />
                </td>
                <td className="px-4 py-2">
                  <Link to={`/events/${event.id}`} className="text-primary font-medium hover:underline">
                    {event.name}
                  </Link>
                  <div className="text-xs text-gray-400 dark:text-gray-500">{event.location}</div>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{event.date}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">
                  {usersById.get(event.ownerId)?.email || event.ownerId}
                </td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${STATUS_PILL_CLASSES[event.status]}`}>
                      {STATUS_LABELS[event.status]}
                    </span>
                    <select
                      value={event.status}
                      onChange={(e) => onStatusChange(event.id, e.target.value as EventStatus)}
                      aria-label={`Cambiar estado de ${event.name}`}
                      className="border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-xs px-1 py-0.5"
                    >
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{event.guestCount}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{event.checkedInCount}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2 justify-end">
                    <Link to={`/events/${event.id}`} title="Ver evento" aria-label={`Ver ${event.name}`} className="text-gray-400 hover:text-primary">
                      <IconEye className="w-4 h-4" />
                    </Link>
                    {event.plan === 'premium' && (
                      <Link to={`/events/${event.id}/reports`} title="Ver reportes" aria-label={`Reportes de ${event.name}`} className="text-gray-400 hover:text-primary">
                        <IconBarChart2 className="w-4 h-4" />
                      </Link>
                    )}
                    <button onClick={() => onRequestDelete(event)} title="Eliminar" aria-label={`Eliminar ${event.name}`} className="text-gray-400 hover:text-red-600">
                      <IconTrash className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && pageItems.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay eventos que coincidan con la búsqueda.</p>
        )}
      </div>

      <Pagination page={currentPage} pageCount={pageCount} totalItems={filtered.length} pageSize={PAGE_SIZE} onPageChange={setPage} />
    </div>
  )
}

function SortableHeader({ label, active, dir, onClick }: { label: string; active: boolean; dir: 'asc' | 'desc'; onClick: () => void }) {
  return (
    <th className="px-4 py-2 font-medium" aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-gray-900 dark:hover:text-white transition-colors">
        {label}
        {active && <span className="text-[10px]">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  )
}

function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full max-w-[80px]" />
        </td>
      ))}
    </tr>
  )
}

function downloadCsv(rows: string[][], filename: string) {
  const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
