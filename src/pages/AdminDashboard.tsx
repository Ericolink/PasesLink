import { useEffect, useMemo, useState } from 'react'
import {
  subscribeToAdminAuditLog,
  subscribeToAllEvents,
  subscribeToAllUsers,
  logAdminAction,
  type AdminAuditLogEntry,
  type AdminUser,
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
import { deleteEvent, setEventStatus } from '../firebase/events'
import type { EventData, EventStatus, Feedback, FeedbackPriority, FeedbackStatus } from '../types'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AdminStatCard, AdminStatCardSkeleton } from '../components/Admin/AdminStatCard'
import { AdminActivityChart } from '../components/Admin/AdminActivityChart'
import { AdminEventsTable } from '../components/Admin/AdminEventsTable'
import { AdminUsersTable } from '../components/Admin/AdminUsersTable'
import { AdminActivityLog } from '../components/Admin/AdminActivityLog'
import { AdminFeedbackTable } from '../components/Admin/AdminFeedbackTable'
import { AdminFeedbackDetail } from '../components/Admin/AdminFeedbackDetail'
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

type Tab = 'events' | 'users' | 'activity' | 'feedback'
type BulkAction = 'archive' | 'cancel' | 'delete'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function AdminDashboard() {
  const { user } = useAuth()
  const [events, setEvents] = useState<EventData[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  const [tab, setTab] = useState<Tab>('events')
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
    const unsubFeedback = subscribeToAllFeedback(setFeedback, handleLoadError)
    return () => {
      unsubEvents()
      unsubUsers()
      unsubFeedback()
    }
  }, [])

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
  const unreadFeedbackCount = useMemo(() => feedback.filter((f) => !f.read).length, [feedback])

  // Fijado al montar (no en cada render) para que el cálculo de "nuevos en
  // 7 días" sea puro dentro del useMemo de abajo.
  const [now] = useState(() => Date.now())

  const stats = useMemo(() => {
    const totalGuests = events.reduce((s, e) => s + e.guestCount, 0)
    const totalCheckins = events.reduce((s, e) => s + e.checkedInCount, 0)
    return {
      activeEvents: events.filter((e) => e.status === 'active').length,
      totalEvents: events.length,
      totalUsers: users.length,
      newUsers7d: users.filter((u) => u.createdAt && now - u.createdAt <= WEEK_MS).length,
      totalGuests,
      totalCheckins,
      checkinRate: totalGuests > 0 ? Math.round((totalCheckins / totalGuests) * 100) : null,
    }
  }, [events, users, now])

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
      <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-1">Panel de administración</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Visión general de eventos y clientes de PaseLink</p>

      {actionError && (
        <p className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}
      {actionMessage && (
        <p className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2 mb-4">{actionMessage}</p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {loading ? (
          Array.from({ length: 7 }).map((_, i) => <AdminStatCardSkeleton key={i} />)
        ) : (
          <>
            <AdminStatCard label="Eventos activos" value={stats.activeEvents} icon={IconCalendar} accent="primary" />
            <AdminStatCard label="Eventos totales" value={stats.totalEvents} icon={IconBarChart2} />
            <AdminStatCard label="Clientes totales" value={stats.totalUsers} icon={IconUsers} />
            <AdminStatCard label="Nuevos (7 días)" value={stats.newUsers7d} icon={IconUserPlus} accent="green" />
            <AdminStatCard label="Invitados totales" value={stats.totalGuests} icon={IconTicket} />
            <AdminStatCard label="Check-ins totales" value={stats.totalCheckins} icon={IconCheckCircle} />
            <AdminStatCard label="Tasa de check-in" value={stats.checkinRate !== null ? `${stats.checkinRate}%` : '—'} icon={IconBarChart} accent="amber" />
          </>
        )}
      </div>

      {!loading && events.length >= 2 && (
        <div className="mb-6">
          <AdminActivityChart events={events} />
        </div>
      )}

      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 mb-4">
        <TabButton label="Eventos" count={events.length} active={tab === 'events'} onClick={() => setTab('events')} />
        <TabButton label="Clientes" count={users.length} active={tab === 'users'} onClick={() => setTab('users')} />
        <TabButton label="Buzón" unreadCount={unreadFeedbackCount} active={tab === 'feedback'} onClick={() => setTab('feedback')} />
        <TabButton label="Actividad" active={tab === 'activity'} onClick={() => setTab('activity')} />
      </div>

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
          loading={loading}
          search={feedbackSearch}
          onSearchChange={setFeedbackSearch}
          onOpen={handleOpenFeedback}
          onToggleFavorite={handleToggleFeedbackFavorite}
          onRequestDelete={(item) => setDeletingFeedbackId(item.id)}
        />
      )}

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

function TabButton({
  label,
  count,
  unreadCount,
  active,
  onClick,
}: {
  label: string
  count?: number
  unreadCount?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-primary text-primary'
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
      }`}
    >
      {label}
      {count !== undefined && <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">{count}</span>}
      {!!unreadCount && (
        <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-white text-[10px] font-bold leading-none">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
