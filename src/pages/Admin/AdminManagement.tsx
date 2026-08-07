import { useEffect, useState } from 'react'
import {
  logAdminAction,
  subscribeToAdminAuditLog,
  type AdminAuditLogEntry,
  type AdminUser,
} from '../../firebase/admin'
import {
  deleteFeedback,
  markFeedbackRead,
  subscribeToAllFeedback,
  toggleFeedbackFavorite,
  updateFeedbackNotes,
  updateFeedbackPriority,
  updateFeedbackStatus,
  updateFeedbackTags,
} from '../../firebase/feedback'
import { reviewCommunityTemplate, subscribeToAllCommunityTemplates } from '../../firebase/communityTemplates'
import { useAuth } from '../../hooks/useAuth'
import { useUnreadFeedbackCount } from '../../hooks/useUnreadFeedbackCount'
import { deleteEvent, setEventStatus } from '../../firebase/events'
import type { CommunityTemplate, EventData, EventStatus, Feedback, FeedbackPriority, FeedbackStatus } from '../../types'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Tab as TabButton, TabList, TabPanel, Tabs } from '../../components/accessibility/AccessibleTabs'
import { AdminEventsTable } from '../../components/Admin/AdminEventsTable'
import { AdminUsersTable } from '../../components/Admin/AdminUsersTable'
import { AdminActivityLog } from '../../components/Admin/AdminActivityLog'
import { AdminFeedbackTable } from '../../components/Admin/AdminFeedbackTable'
import { AdminFeedbackDetail } from '../../components/Admin/AdminFeedbackDetail'
import { AdminCommunityTemplatesTable } from '../../components/Admin/AdminCommunityTemplatesTable'
import { AdminCommunityTemplateDetail } from '../../components/Admin/AdminCommunityTemplateDetail'
import { AdminReportsTab } from '../../components/Admin/AdminReportsTab'

const STATUS_LABELS: Record<EventStatus, string> = {
  active: 'Activo',
  cancelled: 'Cancelado',
  archived: 'Archivado',
}

export type ManagementTab = 'events' | 'users' | 'activity' | 'feedback' | 'reports' | 'templates'
// Colocado a propósito junto al componente que lo define (mismo criterio
// que AuthContext/ThemeContext) — no vale la pena partir el archivo en 2
// solo por esta regla de Fast Refresh.
// eslint-disable-next-line react-refresh/only-export-components
export const MANAGEMENT_TAB_VALUES: ManagementTab[] = ['events', 'users', 'activity', 'feedback', 'reports', 'templates']

type BulkAction = 'archive' | 'cancel' | 'delete'

interface AdminManagementProps {
  events: EventData[]
  users: AdminUser[]
  eventCountByUser: Map<string, number>
  usersById: Map<string, AdminUser>
  loading: boolean
  onRefresh: () => void
  /** Controlado por el shell (AdminDashboard.tsx) — así "Acciones rápidas" del
      Centro de Control puede saltar directo a una pestaña puntual de Gestión. */
  tab: ManagementTab
  onTabChange: (tab: ManagementTab) => void
  initialReportId: string | null
}

// Panel operativo de tablas (Eventos/Clientes/Buzón/Reportes/Plantillas/
// Actividad) — movido tal cual desde el AdminDashboard.tsx monolítico
// original, sin cambios de comportamiento. Los KPIs con tendencia y el
// gráfico de crecimiento que antes vivían acá arriba de las tabs quedaron
// reemplazados por el Centro de Control (ver AdminControlCenter.tsx), que
// ahora es la pantalla de aterrizaje de /admin — Gestión es puramente
// operativo, sin analítica, tal como lo pidió el usuario.
export function AdminManagement({
  events,
  users,
  eventCountByUser,
  usersById,
  loading,
  onRefresh,
  tab,
  onTabChange,
  initialReportId,
}: AdminManagementProps) {
  const { user } = useAuth()
  const [feedback, setFeedback] = useState<Feedback[]>([])
  const [feedbackLoading, setFeedbackLoading] = useState(true)
  const unreadFeedbackCount = useUnreadFeedbackCount()

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
  const [communityTemplates, setCommunityTemplates] = useState<CommunityTemplate[]>([])
  const [communityTemplatesLoading, setCommunityTemplatesLoading] = useState(true)
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null)
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [actionMessage, setActionMessage] = useState('')

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
        setActionError('No se pudieron cargar los mensajes del buzón. Verifica tu conexión o tus permisos.')
        setFeedbackLoading(false)
      },
    )
  }, [tab])

  // Mismo criterio que el efecto de feedback arriba: solo se suscribe
  // mientras la pestaña "Plantillas" está activa, así un admin que nunca la
  // abre no paga por este listener.
  useEffect(() => {
    if (tab !== 'templates') return
    return subscribeToAllCommunityTemplates(
      (data) => {
        setCommunityTemplates(data)
        setCommunityTemplatesLoading(false)
      },
      (err) => {
        console.error('Error loading community templates:', err)
        setCommunityTemplatesLoading(false)
      },
    )
  }, [tab])

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
    } finally {
      // events ya no es un listener en vivo (auditoría F10) — hay que
      // volver a pedirlo para reflejar el cambio, éxito o no.
      onRefresh()
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
      onRefresh()
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
    onRefresh()
    if (failed === 0) setActionMessage(`${ok} evento${ok === 1 ? '' : 's'} actualizado${ok === 1 ? '' : 's'} correctamente.`)
    else setActionError(`${ok} evento(s) actualizados, ${failed} fallaron. Intenta de nuevo con los restantes.`)
  }

  function handleFilterEventsByOwner(owner: AdminUser) {
    onTabChange('events')
    setEventsSearch(owner.email || owner.id)
  }

  const openFeedbackItem = feedback.find((f) => f.id === openFeedbackId) || null
  const deletingFeedbackItem = feedback.find((f) => f.id === deletingFeedbackId) || null
  const openTemplateItem = communityTemplates.find((t) => t.id === openTemplateId) || null
  const inReviewTemplatesCount = communityTemplates.filter((t) => t.status === 'in_review').length

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

  async function handleReviewTemplate(id: string, status: 'approved' | 'rejected' | 'archived', reviewNotes: string) {
    if (!user) return
    setActionBusy(true)
    setActionError('')
    try {
      await reviewCommunityTemplate(id, { status, reviewerUid: user.uid, reviewNotes })
      setActionMessage(status === 'approved' ? 'Plantilla aprobada.' : status === 'rejected' ? 'Plantilla rechazada.' : 'Plantilla archivada.')
      setOpenTemplateId(null)
    } catch (err) {
      console.error('Error revisando plantilla comunitaria:', err)
      setActionError('No se pudo actualizar la plantilla. Intenta de nuevo.')
    } finally {
      setActionBusy(false)
    }
  }

  const bulkActionCopy: Record<BulkAction, { title: string; verb: string; danger: boolean }> = {
    archive: { title: 'Archivar eventos', verb: 'archivar', danger: false },
    cancel: { title: 'Cancelar eventos', verb: 'cancelar', danger: false },
    delete: { title: 'Eliminar eventos', verb: 'eliminar', danger: true },
  }

  return (
    <>
      {actionError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md px-3 py-2 mb-4">{actionError}</p>
      )}
      {actionMessage && (
        <p role="status" className="text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-3 py-2 mb-4">{actionMessage}</p>
      )}

      <Tabs value={tab} onChange={onTabChange}>
        <TabList aria-label="Secciones de administración" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          <TabButton value="events" label="Eventos" count={events.length} />
          <TabButton value="users" label="Clientes" count={users.length} />
          <TabButton value="feedback" label="Buzón" unreadCount={unreadFeedbackCount} />
          <TabButton value="reports" label="Reportes" />
          <TabButton value="templates" label="Plantillas" unreadCount={inReviewTemplatesCount} />
          <TabButton value="activity" label="Actividad" />
        </TabList>

        <TabPanel value="events">
          {/* events/users ya no son listeners en vivo (auditoría F10) — este
              botón los refresca sin salir de la pantalla. Se actualizan solos
              después de archivar/cancelar/borrar un evento desde este mismo
              panel (ver setRefreshToken en esos handlers). */}
          <div className="flex justify-end mb-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-sm text-primary font-medium disabled:opacity-50"
            >
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
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
        </TabPanel>

        <TabPanel value="users">
          <div className="flex justify-end mb-2">
            <button
              onClick={onRefresh}
              disabled={loading}
              className="text-sm text-primary font-medium disabled:opacity-50"
            >
              {loading ? 'Actualizando…' : 'Actualizar'}
            </button>
          </div>
          <AdminUsersTable
            users={users}
            loading={loading}
            eventCountByUser={eventCountByUser}
            onFilterEventsByOwner={handleFilterEventsByOwner}
          />
        </TabPanel>

        <TabPanel value="feedback">
          <AdminFeedbackTable
            items={feedback}
            loading={feedbackLoading}
            search={feedbackSearch}
            onSearchChange={setFeedbackSearch}
            onOpen={handleOpenFeedback}
            onToggleFavorite={handleToggleFeedbackFavorite}
            onRequestDelete={(item) => setDeletingFeedbackId(item.id)}
          />
        </TabPanel>

        <TabPanel value="reports">
          <AdminReportsTab initialReportId={initialReportId} />
        </TabPanel>

        <TabPanel value="templates">
          <AdminCommunityTemplatesTable
            items={communityTemplates}
            loading={communityTemplatesLoading}
            onOpen={(item) => setOpenTemplateId(item.id)}
          />
        </TabPanel>

        <TabPanel value="activity">
          <ActivityTab />
        </TabPanel>
      </Tabs>

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

      <AdminCommunityTemplateDetail
        template={openTemplateItem}
        onClose={() => setOpenTemplateId(null)}
        onReview={handleReviewTemplate}
      />
    </>
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
