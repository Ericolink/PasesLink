import { useMemo, useState } from 'react'
import type { AdminUser } from '../../firebase/admin'
import { EmptyState } from '../Empty/EmptyState'
import { IconDownload, IconUsers } from '../Icons'
import { Pagination } from './Pagination'

type SortKey = 'email' | 'createdAt' | 'eventCount'

const PAGE_SIZE = 20

interface Props {
  users: AdminUser[]
  loading: boolean
  eventCountByUser: Map<string, number>
  onFilterEventsByOwner: (user: AdminUser) => void
}

export function AdminUsersTable({ users, loading, eventCountByUser, onFilterEventsByOwner }: Props) {
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('createdAt')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [page, setPage] = useState(1)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    const result = q
      ? users.filter((u) => (u.email || '').toLowerCase().includes(q) || (u.displayName || '').toLowerCase().includes(q))
      : users
    return [...result].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1
      if (sortKey === 'email') return (a.email || '').localeCompare(b.email || '') * dir
      if (sortKey === 'createdAt') return (a.createdAt - b.createdAt) * dir
      return ((eventCountByUser.get(a.id) || 0) - (eventCountByUser.get(b.id) || 0)) * dir
    })
  }, [users, search, sortKey, sortDir, eventCountByUser])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)

  function toggleSort(key: SortKey) {
    if (key === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(key); setSortDir(key === 'createdAt' ? 'desc' : 'asc') }
  }

  function exportCsv() {
    const rows = [['Email', 'Nombre', 'Eventos', 'Registrado']]
    for (const u of filtered) {
      rows.push([
        u.email || u.id,
        u.displayName || '',
        String(eventCountByUser.get(u.id) || 0),
        u.createdAt ? new Date(u.createdAt).toISOString() : '',
      ])
    }
    const csv = rows.map((r) => r.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'paselink_clientes.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  if (!loading && users.length === 0) {
    return (
      <EmptyState
        icon={<IconUsers className="w-8 h-8" />}
        title="Aún no hay clientes"
        description="Cuando alguien se registre en PaseLink, aparecerá aquí."
      />
    )
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 p-3 border-b border-gray-100 dark:border-gray-700">
        <input
          type="search"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Buscar por email o nombre…"
          aria-label="Buscar clientes"
          className="flex-1 min-w-[180px] border border-gray-200 dark:border-gray-600 dark:bg-gray-900 dark:text-white rounded-md text-sm px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <button
          onClick={exportCsv}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-600 rounded-md px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <IconDownload className="w-4 h-4" /> Exportar CSV
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
              <SortableHeader label="Email" active={sortKey === 'email'} dir={sortDir} onClick={() => toggleSort('email')} />
              <th className="px-4 py-2 font-medium">Nombre</th>
              <SortableHeader label="Eventos" active={sortKey === 'eventCount'} dir={sortDir} onClick={() => toggleSort('eventCount')} />
              <SortableHeader label="Registrado" active={sortKey === 'createdAt'} dir={sortDir} onClick={() => toggleSort('createdAt')} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {loading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="animate-pulse">
                {Array.from({ length: 4 }).map((_, j) => (
                  <td key={j} className="px-4 py-3"><div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full max-w-[100px]" /></td>
                ))}
              </tr>
            ))}
            {!loading && pageItems.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                <td className="px-4 py-2 text-gray-900 dark:text-white">{u.email || u.id}</td>
                <td className="px-4 py-2 text-gray-600 dark:text-gray-300">{u.displayName || '—'}</td>
                <td className="px-4 py-2">
                  <button
                    onClick={() => onFilterEventsByOwner(u)}
                    className="text-primary font-medium hover:underline disabled:no-underline disabled:text-gray-400"
                    disabled={!eventCountByUser.get(u.id)}
                  >
                    {eventCountByUser.get(u.id) || 0}
                  </button>
                </td>
                <td className="px-4 py-2 text-gray-400 dark:text-gray-500">
                  {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && pageItems.length === 0 && (
          <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No hay clientes que coincidan con la búsqueda.</p>
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
