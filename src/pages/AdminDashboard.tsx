import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getEventStats,
  getUserStats,
  subscribeToAdminAuditLog,
  subscribeToAllEvents,
  subscribeToAllUsers,
  logAdminAction,
  type AdminAuditLogEntry,
  type AdminEventStats,
  type AdminUser,
  type AdminUserStats,
} from '../firebase/admin'
import {
  deleteFeedback,
  markFeedbackRead,
  subscribeToAllFeedback,
  toggleFeedbackFavorite,
  updateFeedbackNotes,
  updateFeedbackPriority,
  updateFeedbackStatus,
  updateFeedbackTags,
} from '../firebase/feedback'
import { useAuth } from '../hooks/useAuth'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useUnreadFeedbackCount } from '../hooks/useUnreadFeedbackCount'
import { deleteEvent, setEventStatus } from '../firebase/events'
import { attendancePercent } from '../utils/attendance'
import type { EventData, EventStatus, Feedback, FeedbackPriority, FeedbackStatus } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { MetricTile } from '../components/MetricTile'
import { AdminActivityChart } from '../components/Admin/AdminActivityChart'
import { AdminEventsTable } from '../components/Admin/AdminEventsTable'
import { AdminUsersTable } from '../components/Admin/AdminUsersTable'
import { AdminActivityLog } from '../components/Admin/AdminActivityLog'
import { AdminFeedbackTable } from '../components/Admin/AdminFeedbackTable'
import { AdminFeedbackDetail } from '../components/Admin/AdminFeedbackDetail'
import { AdminReportsTab } from '../components/Admin/AdminReportsTab'
import { ScreenHeader } from '../components/ScreenHeader'
import { ScrollableTabs } from '../components/ScrollableTabs'
import { TabButton } from '../components/TabButton'
import {
  IconBarChart,
  IconBarChart2,
  IconCalendar,
  IconCheckCircle,
  IconTicket,
  IconUserPlus,
  IconUsers,
} from '../components/Icons'

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

type Tab = 'events' | 'users' | 'activity' | 'feedback' | 'reports'
type BulkAction = 'archive' | 'cancel' | 'delete'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function AdminDashboard() {
  useDocumentTitle('Admin')
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState<EventData[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [eventStats, setEventStats] = useState<AdminEventStats | null>(null)
  const [userStats, setUserStats] = useState<AdminUserStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [feedbackLoading, setFeedbackLoading] = useState(true)
  const unreadFeedbackCount = useUnreadFeedbackCount()

  // Link directo del correo de aviso de reportes (ver sendReportNotificationEmail):
  // /admin?tab=reports&reportId=X abre el panel directo en el caso reportado.
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') === 'reports' ? 'reports' : 'events'))
  const [initialReportId] = useState(() => searchParams.get('reportId'))
  const [eventsSearch, setEventsSearch] = useState('')
  const [feedbackSearch, setFeedbackSearch] = useState('')

  const [deletingEvent, setDeletingEvent] = useState<EventData | null>(null)
  const [bulkAction, setBulkAction] = useState<{ events: EventData[]; action: BulkAction } | null>(null)
  // Se guarda el id (no el objeto) para que el modal de detalle y el diálogo
  // de borrado siempre reflejen la versión más reciente del doc — la
  // suscripción en vivo puede actualizar `feedback` mientras el admin lo
  // tiene abierto (ej. después de cambiar su propio estado/prioridad).
  const [openFeedbackId, setOpenFeedbackId] = useState<string | null>(null)
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

  useEffect(() => {
    function handleLoadError(err: Error) {
      console.error('Error loading admin data:', err)
      setLoadError('No se pudieron cargar los datos del panel. Verifica tu conexión o tus permisos.')
      setLoading(false)
    }
    const unsubEvents = subscribeToAllEvents((data) => {
      setEvents(data)
      setLoading(false)
    }, handleLoadError)
    const unsubUsers = subscribeToAllUsers(setUsers, handleLoadError)
    return () => {
      unsubEvents()
      unsubUsers()
    }
  }, [])

  // Tarjetas de resumen: agregaciones server-side, una sola vez al montar
  // (no en vivo — Firestore no ofrece un listener para agregaciones, mismo
  // límite que ya acepta getReportCountForContent en moderation.ts). A
  // diferencia de `events`/`users` de arriba, esto ya NO descarga la
  // colección completa solo para sumar/contar unos pocos números.
  useEffect(() => {
    let cancelled = false
    Promise.all([getEventStats(), getUserStats(Date.now() - WEEK_MS)])
      .then(([ev, us]) => {
        if (cancelled) return
        setEventStats(ev)
        setUserStats(us)
      })
      .catch((err) => {
        console.error('Error loading admin stats:', err)
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // Colección completa de feedback: solo hace falta para listar mensajes en
  // la pestaña "Buzón" — el badge de no leídos (siempre visible) ya usa
  // subscribeToUnreadFeedbackCount vía useUnreadFeedbackCount, que es una
  // query acotada (where read==false), no esta descarga completa. Así, un
  // admin que nunca abre "Buzón" no paga por ella.
  useEffect(() => {
    if (tab !== 'feedback') return
    return subscribeToAllFeedback(
      (data) => {
        setFeedback(data)
        setFeedbackLoading(false)
      },
      (err) => {
        console.error('Error loading feedback:', err)
        setLoadError('No se pudieron cargar los mensajes del buzón. Verifica tu conexión o tus permisos.')
        setFeedbackLoading(false)
      },
    )
  }, [tab])

  // Memoizado: recorrer eventos+usuarios para construir estos mapas es
  // O(n) — intrascendente hoy, pero deja de serlo con miles de filas si se
  // recalculara en cada render (p.ej. al escribir en el buscador).
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const eventCountByUser = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      counts.set(event.ownerId, (counts.get(event.ownerId) || 0) + 1)
    }
    return counts
  }, [events])
  // totalPeople (suma de peopleCount, personas reales incluyendo
  // acompañantes/familias) es el denominador correcto para checkinRate —
  // totalGuests (invitaciones) da porcentajes >100% en cuanto hay
  // acompañantes, igual que el bug corregido en Reports.tsx. totalGuests se
  // sigue mostrando aparte como "Invitados totales" (conteo de invitaciones,
  // una métrica válida por sí misma). Ambos vienen ahora de getEventStats
  // (agregación server-side, ver efecto de arriba) en vez de recorrer el
  // array completo de eventos.
  const stats = useMemo(() => ({
    activeEvents: eventStats?.activeEvents ?? 0,
    totalEvents: eventStats?.totalEvents ?? 0,
    totalUsers: userStats?.totalUsers ?? 0,
    newUsers7d: userStats?.newUsers7d ?? 0,
    totalGuests: eventStats?.totalGuests ?? 0,
    totalCheckins: eventStats?.totalCheckins ?? 0,
    checkinRate: eventStats && eventStats.totalPeople > 0
      ? Math.round(attendancePercent(eventStats.totalCheckins, eventStats.totalPeople))
      : null,
  }), [eventStats, userStats])

  function auditContext() {
    if (!user) throw new Error('No hay sesión de admin activa')
    return { adminUid: user.uid, adminEmail: user.email }
  }

  async function handleStatusChange(eventId: string, status: EventStatus) {
    setActionError('')
    const event = events.find((e) => e.id === eventId)
    try {
      await setEventStatus(eventId, status)
      if (event) {
        await logAdminAction({
          ...auditContext(),
          action: 'event_status_change',
          targetType: 'event',
          targetId: eventId,
          targetName: event.name,
          meta: STATUS_LABELS[status],
        })
      }
    } catch (err) {
      console.error('Error updating event status:', err)
      setActionError('No se pudo actualizar el estado del evento. Intenta de nuevo.')
    }
  }

  async function confirmDeleteEvent() {
    if (!deletingEvent) return
    setActionBusy(true)
    setActionError('')
    try {
      await deleteEvent(deletingEvent.id)
      await logAdminAction({
        ...auditContext(),
        action: 'event_delete',
        targetType: 'event',
        targetId: deletingEvent.id,
        targetName: deletingEvent.name,
      })
      setActionMessage(`"${deletingEvent.name}" fue eliminado.`)
    } catch (err) {
      console.error('Error deleting event:', err)
      setActionError('No se pudo eliminar el evento por completo. Es posible que parte de los datos ya se haya borrado — revisa el evento e intenta de nuevo.')
    } finally {
      setActionBusy(false)
      setDeletingEvent(null)
    }
  }

  async function confirmBulkAction() {
    if (!bulkAction) return
    setActionBusy(true)
    setActionError('')
    let ok = 0
    let failed = 0
    for (const event of bulkAction.events) {
      try {
        if (bulkAction.action === 'delete') {
          await deleteEvent(event.id)
          await logAdminAction({ ...auditContext(), action: 'event_delete', targetType: 'event', targetId: event.id, targetName: event.name })
        } else {
          const status: EventStatus = bulkAction.action === 'archive' ? 'archived' : 'cancelled'
          await setEventStatus(event.id, status)
          await logAdminAction({ ...auditContext(), action: 'event_status_change', targetType: 'event', targetId: event.id, targetName: event.name, meta: STATUS_LABELS[status] })
        }
        ok++
      } catch (err) {
        console.error('Error en acción masiva sobre evento', event.id, err)
        failed++
      }
    }
    setActionBusy(false)
    setBulkAction(null)
    if (failed === 0) setActionMessage(`${ok} evento${ok === 1 ? '' : 's'} actualizado${ok === 1 ? '' : 's'} correctamente.`)
    else setActionError(`${ok} evento(s) actualizados, ${failed} fallaron. Intenta de nuevo con los restantes.`)
  }

  function handleFilterEventsByOwner(owner: AdminUser) {
    setTab('events')
    setEventsSearch(owner.email || owner.id)
  }

  const openFeedbackItem = feedback.find((f) => f.id === openFeedbackId) || null
  const deletingFeedbackItem = feedback.find((f) => f.id === deletingFeedbackId) || null

  function handleOpenFeedback(item: Feedback) {
    setOpenFeedbackId(item.id)
    if (!item.read) {
      markFeedbackRead(item.id).catch((err) => console.error('Error marcando feedback como leído:', err))
    }
  }

  async function handleFeedbackStatusChange(id: string, status: FeedbackStatus) {
    try {
      await updateFeedbackStatus(id, status)
    } catch (err) {
      console.error('Error actualizando estado del feedback:', err)
      setActionError('No se pudo actualizar el estado del mensaje. Intenta de nuevo.')
    }
  }

  async function handleFeedbackPriorityChange(id: string, priority: FeedbackPriority) {
    try {
      await updateFeedbackPriority(id, priority)
    } catch (err) {
      console.error('Error actualizando prioridad del feedback:', err)
      setActionError('No se pudo actualizar la prioridad del mensaje. Intenta de nuevo.')
    }
  }

  async function handleSaveFeedbackTags(id: string, tags: string[]) {
    try {
      await updateFeedbackTags(id, tags)
    } catch (err) {
      console.error('Error actualizando etiquetas del feedback:', err)
      setActionError('No se pudieron actualizar las etiquetas. Intenta de nuevo.')
    }
  }

  async function handleSaveFeedbackNotes(id: string, notes: string) {
    try {
      await updateFeedbackNotes(id, notes)
    } catch (err) {
      console.error('Error guardando notas del feedback:', err)
      setActionError('No se pudieron guardar las notas. Intenta de nuevo.')
    }
  }

  async function handleToggleFeedbackFavorite(item: Feedback) {
    try {
      await toggleFeedbackFavorite(item.id, item.favorite)
    } catch (err) {
      console.error('Error actualizando favorito del feedback:', err)
      setActionError('No se pudo actualizar el favorito. Intenta de nuevo.')
    }
  }

  async function confirmDeleteFeedback() {
    if (!deletingFeedbackItem) return
    setActionBusy(true)
    setActionError('')
    try {
      await deleteFeedback(deletingFeedbackItem.id)
      setActionMessage('El mensaje fue eliminado.')
      if (openFeedbackId === deletingFeedbackItem.id) setOpenFeedbackId(null)
    } catch (err) {
      console.error('Error eliminando feedback:', err)
      setActionError('No se pudo eliminar el mensaje. Intenta de nuevo.')
    } finally {
      setActionBusy(false)
      setDeletingFeedbackId(null)
    }
  }

  const bulkActionCopy: Record<BulkAction, { title: string; verb: string; danger: boolean }> = {
    archive: { title: 'Archivar eventos', verb: 'archivar', danger: false },
    cancel: { title: 'Cancelar eventos', verb: 'cancelar', danger: false },
    delete: { title: 'Eliminar eventos', verb: 'eliminar', danger: true },
  }

  if (loadError) return <p className="text-center text-red-500 mt-16">{loadError}</p>

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <ScreenHeader title="Panel de administración" subtitle="Visión general de eventos y clientes de PaseLink" backTo="/profile" />

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}
      {actionMessage && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2 mb-4">{actionMessage}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {statsLoading ? (
          Array.from({ length: 7 }).map((_, i) => <MetricTile.Skeleton key={i} />)
        ) : (
          <>
            <MetricTile label="Eventos activos" value={stats.activeEvents} icon={IconCalendar} align="start" accent="primary" />
            <MetricTile label="Eventos totales" value={stats.totalEvents} icon={IconBarChart2} align="start" />
            <MetricTile label="Clientes totales" value={stats.totalUsers} icon={IconUsers} align="start" />
            <MetricTile label="Nuevos (7 días)" value={stats.newUsers7d} icon={IconUserPlus} align="start" accent="success" />
            <MetricTile label="Invitados totales" value={stats.totalGuests} icon={IconTicket} align="start" />
            <MetricTile label="Check-ins totales" value={stats.totalCheckins} icon={IconCheckCircle} align="start" />
            <MetricTile label="Tasa de check-in" value={stats.checkinRate !== null ? `${stats.checkinRate}%` : '—'} icon={IconBarChart} align="start" accent="warning" />
          </>
        )}
      </div>

      {!loading && events.length >= 2 && (
        <div className="mb-6">
          <AdminActivityChart events={events} />
        </div>
      )}

      <ScrollableTabs className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
        <TabButton label="Eventos" count={events.length} active={tab === 'events'} onClick={() => setTab('events')} />
        <TabButton label="Clientes" count={users.length} active={tab === 'users'} onClick={() => setTab('users')} />
        <TabButton label="Buzón" unreadCount={unreadFeedbackCount} active={tab === 'feedback'} onClick={() => setTab('feedback')} />
        <TabButton label="Reportes" active={tab === 'reports'} onClick={() => setTab('reports')} />
        <TabButton label="Actividad" active={tab === 'activity'} onClick={() => setTab('activity')} />
      </ScrollableTabs>

      {tab === 'events' && (
        <AdminEventsTable
          events={events}
          usersById={usersById}
          loading={loading}
          search={eventsSearch}
          onSearchChange={setEventsSearch}
          onStatusChange={handleStatusChange}
          onRequestDelete={setDeletingEvent}
          onRequestBulkAction={(evts, action) => setBulkAction({ events: evts, action })}
        />
      )}

      {tab === 'users' && (
        <AdminUsersTable
          users={users}
          loading={loading}
          eventCountByUser={eventCountByUser}
          onFilterEventsByOwner={handleFilterEventsByOwner}
        />
      )}

      {tab === 'feedback' && (
        <AdminFeedbackTable
          items={feedback}
          loading={feedbackLoading}
          search={feedbackSearch}
          onSearchChange={setFeedbackSearch}
          onOpen={handleOpenFeedback}
          onToggleFavorite={handleToggleFeedbackFavorite}
          onRequestDelete={(item) => setDeletingFeedbackId(item.id)}
        />
      )}

      {tab === 'reports' && <AdminReportsTab initialReportId={initialReportId} />}

      {tab === 'activity' && <ActivityTab />}

      <ConfirmDialog
        open={!!deletingEvent}
        title="Eliminar evento"
        message={`¿Eliminar "${deletingEvent?.name}" definitivamente? Se borrarán todos sus invitados y el historial de check-ins. Esta acción no se puede deshacer. Si el evento tiene muchos invitados, puede tardar varios segundos — no cierres esta ventana.`}
        confirmLabel={actionBusy ? 'Eliminando…' : 'Eliminar'}
        danger
        onConfirm={confirmDeleteEvent}
        onCancel={() => setDeletingEvent(null)}
      />

      <ConfirmDialog
        open={!!bulkAction}
        title={bulkAction ? bulkActionCopy[bulkAction.action].title : ''}
        message={bulkAction ? `¿Seguro que quieres ${bulkActionCopy[bulkAction.action].verb} ${bulkAction.events.length} evento(s)? ${bulkAction.action === 'delete' ? 'Esta acción no se puede deshacer.' : ''}` : ''}
        confirmLabel={actionBusy ? 'Procesando…' : 'Confirmar'}
        danger={bulkAction ? bulkActionCopy[bulkAction.action].danger : false}
        onConfirm={confirmBulkAction}
        onCancel={() => setBulkAction(null)}
      />

      <ConfirmDialog
        open={!!deletingFeedbackItem}
        title="Eliminar mensaje"
        message={`¿Eliminar "${deletingFeedbackItem?.subject}" definitivamente? Esta acción no se puede deshacer.`}
        confirmLabel={actionBusy ? 'Eliminando…' : 'Eliminar'}
        danger
        onConfirm={confirmDeleteFeedback}
        onCancel={() => setDeletingFeedbackId(null)}
      />

      <AdminFeedbackDetail
        feedback={openFeedbackItem}
        onClose={() => setOpenFeedbackId(null)}
        onStatusChange={handleFeedbackStatusChange}
        onPriorityChange={handleFeedbackPriorityChange}
        onSaveTags={handleSaveFeedbackTags}
        onSaveNotes={handleSaveFeedbackNotes}
        onToggleFavorite={handleToggleFeedbackFavorite}
        onRequestDelete={(item) => setDeletingFeedbackId(item.id)}
      />
    </div>
  )
}

function ActivityTab() {
  const [entries, setEntries] = useState<AdminAuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    return subscribeToAdminAuditLog(
      (data) => {
        setEntries(data)
        setLoading(false)
      },
      (err) => {
        console.error('Error loading admin audit log:', err)
        setLoading(false)
      },
    )
  }, [])

  return <AdminActivityLog entries={entries} loading={loading} />
}
