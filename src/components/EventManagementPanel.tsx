import { Link } from 'react-router-dom'
import type { EventData } from '../types'
import type { useEventLifecycleActions } from '../hooks/useEventLifecycleActions'
import { Button } from './Button'
import { ConfirmDialog } from './ConfirmDialog'

function statusLabel(status: string) {
  if (status === 'active') return 'Activo'
  if (status === 'cancelled') return 'Cancelado'
  return 'Archivado'
}

interface Props {
  event: EventData
  actions: ReturnType<typeof useEventLifecycleActions>
}

// Extraído de EventDetail.tsx junto con useEventLifecycleActions (auditoría
// de escalabilidad, hallazgo F13): panel colapsable "Gestión del evento"
// (cambiar estado, eliminar) — solo visible para el dueño (ver el gate en el
// llamador). Incluye sus 2 diálogos de confirmación, que antes vivían
// mezclados entre los de otras secciones (co-organizadores) al final de
// EventDetail.tsx.
export function EventManagementPanel({ event, actions }: Props) {
  const {
    updatingStatus,
    deleting,
    confirmDelete,
    confirmCancelEvent,
    actionError,
    setConfirmDelete,
    setConfirmCancelEvent,
    handleStatusChange,
    handleDelete,
  } = actions

  return (
    <>
      <details className="group border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden mb-5">
        <summary className="flex items-center justify-between px-5 py-4 cursor-pointer select-none list-none bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wide">
            Gestión del evento
          </span>
          <span className="text-xs text-gray-400">
            <span className="group-open:hidden">▾</span>
            <span className="hidden group-open:inline">▴</span>
          </span>
        </summary>

        <div className="bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">

          {/* Estado del evento */}
          <div className="p-5">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Estado del evento</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Estado actual: <span className="font-semibold">{statusLabel(event.status)}</span>
            </p>
            <div className="flex gap-2 flex-wrap">
              {event.status === 'active' ? (
                <button
                  onClick={() => setConfirmCancelEvent(true)}
                  disabled={updatingStatus}
                  className="text-sm border border-red-200 text-red-600 dark:border-red-700/60 dark:text-red-400 rounded-lg px-4 py-2 font-medium hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50 transition-colors"
                >
                  Cancelar evento
                </button>
              ) : (
                <button
                  onClick={() => handleStatusChange('active')}
                  disabled={updatingStatus}
                  className="text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 transition-colors"
                >
                  Reactivar evento
                </button>
              )}
              <Link
                to="/events/new"
                className="text-sm border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-400 rounded-lg px-4 py-2 font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Crear nuevo evento
              </Link>
            </div>
          </div>

          {/* Zona peligrosa */}
          <div className="p-5 bg-red-50/40 dark:bg-red-900/10">
            <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Zona peligrosa</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
              Borra el evento, sus invitados y el historial de check-ins de forma permanente. No se puede deshacer.
            </p>
            {actionError && (
              <p className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-3">
                {actionError}
              </p>
            )}
            <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
              {deleting ? 'Eliminando…' : 'Eliminar evento definitivamente'}
            </Button>
          </div>
        </div>
      </details>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Eliminar "${event.name}"`}
        message="Se borrarán todos los invitados y el historial de check-ins. Esta acción no se puede deshacer."
        confirmLabel={deleting ? 'Eliminando…' : 'Sí, eliminar'}
        cancelLabel="Cancelar"
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
      <ConfirmDialog
        open={confirmCancelEvent}
        danger
        title={`Cancelar "${event.name}"`}
        message="Los invitados y coanfitriones van a ver el evento marcado como cancelado. Podés reactivarlo después si fue un error."
        confirmLabel={updatingStatus ? 'Cancelando…' : 'Sí, cancelar evento'}
        cancelLabel="Volver"
        onConfirm={() => { void handleStatusChange('cancelled'); setConfirmCancelEvent(false) }}
        onCancel={() => setConfirmCancelEvent(false)}
      />
    </>
  )
}
