import type { EventData } from '../types'
import type { useEventLifecycleActions } from '../hooks/useEventLifecycleActions'
import { AccessibleButton } from './accessibility/AccessibleButton'
import { ConfirmDialog } from './ConfirmDialog'

interface Props {
  event: EventData
  actions: ReturnType<typeof useEventLifecycleActions>
}

// Extraído de EventDetail.tsx junto con useEventLifecycleActions (auditoría
// de escalabilidad, hallazgo F13) — solo visible para el dueño (ver el gate
// en el llamador). Reducido a únicamente "Zona peligrosa" (eliminar evento):
// sin "Cancelar evento" ni "Reactivar evento" ni "Crear nuevo evento" —
// ninguna aporta valor suficiente para justificar su lugar en el dashboard
// (rediseño del Dashboard del Evento). Un evento puede seguir llegando a
// status 'cancelled'/'archived' por otras vías (ver AdminManagement.tsx);
// este panel ya no ofrece ninguna acción de estado desde el organizador.
//
// La confirmación de borrado exige escribir el nombre EXACTO del evento
// (mismo patrón que GitHub para borrar un repositorio, ver
// ConfirmDialog.tsx `confirmationText`) — es la acción más irreversible de
// todo el dashboard (borra invitados y check-ins también), así que la
// fricción extra es intencional.
export function EventManagementPanel({ event, actions }: Props) {
  const { deleting, confirmDelete, actionError, setConfirmDelete, handleDelete } = actions

  return (
    <>
      <div className="border border-red-200 dark:border-red-900/50 rounded-xl bg-red-50/40 dark:bg-red-900/10 p-5 mb-5">
        <h3 className="text-sm font-semibold text-red-700 dark:text-red-400 mb-1">Zona peligrosa</h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Borra el evento, sus invitados y el historial de check-ins de forma permanente. No se puede deshacer.
        </p>
        {actionError && (
          <p className="text-xs text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30 rounded-lg px-3 py-2 mb-3">
            {actionError}
          </p>
        )}
        <AccessibleButton variant="danger" size="sm" onClick={() => setConfirmDelete(true)} disabled={deleting}>
          {deleting ? 'Eliminando…' : 'Eliminar evento definitivamente'}
        </AccessibleButton>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        danger
        title={`Eliminar "${event.name}"`}
        message="Se borrarán todos los invitados y el historial de check-ins. Esta acción no se puede deshacer."
        confirmLabel={deleting ? 'Eliminando…' : 'Sí, eliminar'}
        cancelLabel="Cancelar"
        confirmationText={event.name}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  )
}
