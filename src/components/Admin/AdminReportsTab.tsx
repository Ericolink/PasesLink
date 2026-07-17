import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  DEFAULT_REPORTS_LIVE_LIMIT,
  deleteReportedContent,
  getOlderReports,
  getReportById,
  subscribeToRecentReports,
  updateReportStatus,
} from '../../firebase/moderation'
import type { ContentReport, ReportedContentType, ReportStatus } from '../../types'
import { REPORT_STATUS_LABELS } from '../../types'
import { ConfirmDialog } from '../ConfirmDialog'
import { AdminReportsTable } from './AdminReportsTable'
import { AdminReportDetail } from './AdminReportDetail'

interface Props {
  initialReportId?: string | null
}

export function AdminReportsTab({ initialReportId }: Props) {
  const { user } = useAuth()
  const [statusFilter, setStatusFilter] = useState<ReportStatus | 'all'>('pending')
  const [contentTypeFilter, setContentTypeFilter] = useState<ReportedContentType | 'all'>('all')
  const [search, setSearch] = useState('')

  const [recent, setRecent] = useState<ContentReport[]>([])
  const [older, setOlder] = useState<ContentReport[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [openReportId, setOpenReportId] = useState<string | null>(null)
  const [deepLinkedReport, setDeepLinkedReport] = useState<ContentReport | null>(null)
  const [deletingReport, setDeletingReport] = useState<ContentReport | null>(null)
  const [actionError, setActionError] = useState('')
  const [actionBusy, setActionBusy] = useState(false)

  // Link directo del correo de aviso (VITE_..._admin_url) — puede apuntar a
  // un reporte fuera de la ventana en vivo cargada, así que se busca aparte
  // y se muestra en cuanto llega, sin esperar a que aparezca en la tabla.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!initialReportId) return
    setOpenReportId(initialReportId)
    getReportById(initialReportId)
      .then((r) => { if (r) setDeepLinkedReport(r) })
      .catch((err) => console.error('Error abriendo el reporte del link directo:', err))
  }, [initialReportId])
  /* eslint-enable react-hooks/set-state-in-effect */

  const activeStatusFilter = statusFilter === 'all' ? undefined : statusFilter

  /* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
  useEffect(() => {
    setLoading(true)
    setOlder([])
    setHasMore(true)
    const unsub = subscribeToRecentReports(
      (items) => { setRecent(items); setLoading(false) },
      (err) => { console.error('Error cargando reportes:', err); setLoadError('No se pudieron cargar los reportes.'); setLoading(false) },
      DEFAULT_REPORTS_LIVE_LIMIT,
      activeStatusFilter,
    )
    return unsub
  }, [statusFilter])
  /* eslint-enable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */

  const allReports = useMemo(() => {
    const byId = new Map<string, ContentReport>()
    for (const r of recent) byId.set(r.id, r)
    for (const r of older) byId.set(r.id, r)
    return Array.from(byId.values()).sort((a, b) => b.createdAt - a.createdAt)
  }, [recent, older])

  async function handleLoadMore() {
    if (loadingMore || allReports.length === 0) return
    setLoadingMore(true)
    try {
      const oldest = Math.min(...allReports.map((r) => r.createdAt))
      const { reports, hasMore: more } = await getOlderReports(oldest, DEFAULT_REPORTS_LIVE_LIMIT, activeStatusFilter)
      setOlder((prev) => [...prev, ...reports])
      setHasMore(more)
    } catch (err) {
      console.error('Error cargando más reportes:', err)
    } finally {
      setLoadingMore(false)
    }
  }

  const admin = { adminUid: user?.uid || '', adminEmail: user?.email || null }
  const openReport = allReports.find((r) => r.id === openReportId)
    || (deepLinkedReport?.id === openReportId ? deepLinkedReport : null)

  async function handleStatusChange(id: string, status: ReportStatus) {
    setActionError('')
    try {
      await updateReportStatus(id, status, admin, REPORT_STATUS_LABELS[status])
    } catch (err) {
      console.error('Error actualizando estado del reporte:', err)
      setActionError('No se pudo actualizar el estado. Intenta de nuevo.')
    }
  }

  async function confirmDeleteContent() {
    if (!deletingReport) return
    setActionBusy(true)
    setActionError('')
    try {
      await deleteReportedContent(deletingReport, admin)
    } catch (err) {
      console.error('Error eliminando el contenido reportado:', err)
      setActionError('No se pudo eliminar el contenido. Puede que ya se haya borrado antes.')
    } finally {
      setActionBusy(false)
      setDeletingReport(null)
    }
  }

  if (loadError) return <p className="text-center text-error mt-8">{loadError}</p>

  return (
    <div>
      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}

      <AdminReportsTable
        items={allReports}
        loading={loading}
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        contentTypeFilter={contentTypeFilter}
        onContentTypeFilterChange={setContentTypeFilter}
        onOpen={(item) => setOpenReportId(item.id)}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={handleLoadMore}
      />

      <AdminReportDetail
        report={openReport}
        admin={admin}
        onClose={() => setOpenReportId(null)}
        onStatusChange={handleStatusChange}
        onDeleteContent={setDeletingReport}
      />

      <ConfirmDialog
        open={!!deletingReport}
        title="Eliminar contenido reportado"
        message={`¿Eliminar ${deletingReport?.contentType === 'comment' ? 'este comentario' : 'esta foto'} definitivamente? Esta acción no se puede deshacer.`}
        confirmLabel={actionBusy ? 'Eliminando…' : 'Eliminar'}
        danger
        onConfirm={confirmDeleteContent}
        onCancel={() => setDeletingReport(null)}
      />
    </div>
  )
}
