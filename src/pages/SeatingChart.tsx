import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEvent } from '../hooks/useEvent'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useSeatingChart } from '../hooks/useSeatingChart'
import type { SeatingTableWithOccupancy } from '../hooks/useSeatingChart'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { createTable, updateTable, deleteTable, assignGuestToTable } from '../firebase/seating'
import { partySize } from '../firebase/guests'
import type { SeatingTableData, SeatingTableShape } from '../types'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { LoadingInline } from '../components/LoadingInline'
import { ConfirmDialog } from '../components/ConfirmDialog'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { TableCard } from '../components/Seating/TableCard'
import { SeatingTableEditor } from '../components/Seating/SeatingTableEditor'
import { AssignGuestModal } from '../components/Seating/AssignGuestModal'

export function SeatingChart() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, guests, loading, guestsLoading, error } = useEvent(eventId)
  useDocumentTitle(event ? `Mesas · ${event.name}` : 'Mesas')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const perms = useEventPermissions(event, user)
  const { tables, unassignedGuests, loading: tablesLoading } = useSeatingChart(eventId, guests)

  const [editingTable, setEditingTable] = useState<SeatingTableData | 'new' | null>(null)
  const [assigningTable, setAssigningTable] = useState<SeatingTableWithOccupancy | null>(null)
  const [deletingTable, setDeletingTable] = useState<SeatingTableWithOccupancy | null>(null)

  if (loading || tablesLoading) return <LoadingInline label="Cargando mesas…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  const canRead = perms.manageSeating || perms.viewReports
  if (!canRead) {
    return <ErrorFallbackCTA message="No tienes acceso a las mesas de este evento." />
  }
  const canManage = perms.manageSeating

  const tablesById: Map<string, SeatingTableData> = new Map(tables.map((t) => [t.id, t]))

  async function handleSaveTable(input: { name: string; capacity: number; shape: SeatingTableShape; zone?: string }) {
    if (!eventId) return
    if (editingTable && editingTable !== 'new') {
      await updateTable(eventId, editingTable.id, input)
    } else {
      await createTable(eventId, { ...input, sortOrder: tables.length })
    }
  }

  async function handleDeleteTable() {
    if (!eventId || !deletingTable) return
    // Libera a los invitados de la mesa antes de borrarla — evita dejar
    // GuestData.tableId apuntando a un documento que ya no existe.
    await Promise.all(deletingTable.guests.map((g) => assignGuestToTable(eventId, g.id, null)))
    await deleteTable(eventId, deletingTable.id)
    setDeletingTable(null)
  }

  const totalSeated = tables.reduce((sum, t) => sum + t.occupancy, 0)
  const totalPeople = guests.reduce((sum, g) => sum + partySize(g), 0)

  return (
    <>
      <ScreenHeader
        title="Mesas"
        subtitle={`${totalSeated} / ${totalPeople} personas sentadas`}
        backTo={`/events/${eventId}`}
        templateId={event.templateId}
        action={canManage ? (
          <AccessibleButton variant="primary" size="sm" onClick={() => setEditingTable('new')}>
            Nueva mesa
          </AccessibleButton>
        ) : undefined}
      />

      {guestsLoading && <LoadingInline label="Cargando invitados…" />}

      {tables.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-10">
          Todavía no hay mesas. {canManage && 'Crea la primera con "Nueva mesa".'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {tables.map((table) => (
            <TableCard
              key={table.id}
              table={table}
              readOnly={!canManage}
              onAssign={() => setAssigningTable(table)}
              onEdit={() => setEditingTable(table)}
              onDelete={() => setDeletingTable(table)}
              onRemoveGuest={(guestId) => eventId && assignGuestToTable(eventId, guestId, null)}
            />
          ))}
        </div>
      )}

      {unassignedGuests.length > 0 && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
            Invitados sin mesa ({unassignedGuests.length})
          </h2>
          <ul className="space-y-1">
            {unassignedGuests.slice(0, 20).map((guest) => (
              <li key={guest.id} className="text-sm text-gray-600 dark:text-gray-300">
                {guest.name} {guest.lastName || ''}
                {partySize(guest) > 1 && <span className="text-gray-400"> (+{partySize(guest) - 1})</span>}
              </li>
            ))}
            {unassignedGuests.length > 20 && (
              <li className="text-xs text-gray-400">y {unassignedGuests.length - 20} más…</li>
            )}
          </ul>
        </div>
      )}

      {eventId && editingTable && (
        <SeatingTableEditor
          open={!!editingTable}
          onClose={() => setEditingTable(null)}
          table={editingTable === 'new' ? null : editingTable}
          onSave={handleSaveTable}
        />
      )}

      {eventId && assigningTable && (
        <AssignGuestModal
          open={!!assigningTable}
          onClose={() => setAssigningTable(null)}
          eventId={eventId}
          table={assigningTable}
          guests={guests}
          tablesById={tablesById}
        />
      )}

      <ConfirmDialog
        open={!!deletingTable}
        title="Eliminar mesa"
        message={`¿Eliminar "${deletingTable?.name}"? Los invitados asignados quedarán sin mesa.`}
        confirmLabel="Eliminar"
        danger
        onConfirm={handleDeleteTable}
        onCancel={() => setDeletingTable(null)}
      />
    </>
  )
}
