import type { SeatingTableWithOccupancy } from '../../hooks/useSeatingChart'
import { partySize } from '../../firebase/guests'
import { AttendanceProgressBar } from '../AttendanceProgressBar'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { IconAlertTriangle, IconEdit, IconTrash } from '../accessibility/AccessibleIcon'

const SHAPE_LABELS: Record<string, string> = {
  round: 'Redonda',
  rectangular: 'Rectangular',
  square: 'Cuadrada',
  custom: 'Otra',
}

interface Props {
  table: SeatingTableWithOccupancy
  readOnly: boolean
  onAssign: () => void
  onEdit: () => void
  onDelete: () => void
  onRemoveGuest: (guestId: string) => void
}

export function TableCard({ table, readOnly, onAssign, onEdit, onDelete, onRemoveGuest }: Props) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-gray-800 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{table.name}</h3>
          <p className="text-xs text-gray-400 truncate">
            {SHAPE_LABELS[table.shape] || table.shape}
            {table.zone && ` · ${table.zone}`}
          </p>
        </div>
        {!readOnly && (
          <div className="flex items-center gap-1 shrink-0">
            <AccessibleButton iconOnly variant="text" size="sm" aria-label={`Editar ${table.name}`} onClick={onEdit}>
              <IconEdit />
            </AccessibleButton>
            <AccessibleButton iconOnly variant="text" size="sm" aria-label={`Eliminar ${table.name}`} onClick={onDelete} className="text-red-500 hover:text-red-600">
              <IconTrash />
            </AccessibleButton>
          </div>
        )}
      </div>

      <AttendanceProgressBar
        present={table.occupancy}
        expected={table.capacity}
        unitLabel="personas"
        rightLabel={table.isOverCapacity ? (
          <span className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 font-semibold">
            <IconAlertTriangle className="w-3.5 h-3.5" /> Sobrecupo
          </span>
        ) : undefined}
      />

      {table.guests.length > 0 ? (
        <ul className="space-y-1">
          {table.guests.map((guest) => (
            <li key={guest.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-gray-700 dark:text-gray-300 truncate">
                {guest.name} {guest.lastName || ''} {partySize(guest) > 1 && <span className="text-gray-400">(+{partySize(guest) - 1})</span>}
              </span>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onRemoveGuest(guest.id)}
                  className="text-xs text-gray-400 hover:text-red-500 shrink-0"
                >
                  Quitar
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-gray-400">Sin invitados asignados.</p>
      )}

      {!readOnly && (
        <AccessibleButton variant="secondary" size="sm" onClick={onAssign} className="self-start">
          Asignar invitado
        </AccessibleButton>
      )}
    </div>
  )
}
