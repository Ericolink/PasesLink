import { useMemo, useState } from 'react'
import type { GuestData, SeatingTableData } from '../../types'
import { partySize } from '../../firebase/guests'
import { assignGuestToTable } from '../../firebase/seating'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { AccessibleButton } from '../accessibility/AccessibleButton'
import { InputField } from '../accessibility/AccessibleField'
import { IconSearch } from '../accessibility/AccessibleIcon'

interface Props {
  open: boolean
  onClose: () => void
  eventId: string
  table: SeatingTableData
  guests: GuestData[]
  tablesById: Map<string, SeatingTableData>
}

// Buscar y asignar un invitado (o moverlo desde otra mesa) a `table`. No
// filtra por cupo disponible: el pedido es DETECTAR sobrecupo, no impedirlo
// (el organizador puede tener motivos para sentar más gente de la que la
// mesa "debería" tener) — TableCard ya muestra el aviso si corresponde.
export function AssignGuestModal({ open, onClose, eventId, table, guests, tablesById }: Props) {
  const [search, setSearch] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const candidates = useMemo(() => {
    const term = search.trim().toLowerCase()
    return guests
      .filter((g) => g.tableId !== table.id)
      .filter((g) => !term || g.name.toLowerCase().includes(term) || g.lastName?.toLowerCase().includes(term))
      .slice(0, 50)
  }, [guests, search, table.id])

  if (!open) return null

  async function handleAssign(guestId: string) {
    setMovingId(guestId)
    setError('')
    try {
      await assignGuestToTable(eventId, guestId, table.id)
    } catch {
      setError('No se pudo asignar. Intenta de nuevo.')
    } finally {
      setMovingId(null)
    }
  }

  return (
    <AccessibleModal open={open} onClose={onClose} label={`Asignar invitado a ${table.name}`} variant="dialog" maxWidth="sm:max-w-md">
      <div className="p-5 flex flex-col max-h-[80dvh]">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Asignar a {table.name}</h2>
        <div className="relative mb-3">
          <IconSearch className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <InputField
            label="Buscar invitado"
            labelClassName="sr-only"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre…"
          />
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400 mb-2" role="alert">{error}</p>}
        <ul className="overflow-y-auto space-y-1 -mx-1 px-1">
          {candidates.length === 0 && (
            <li className="text-sm text-gray-400 py-4 text-center">Sin resultados.</li>
          )}
          {candidates.map((guest) => {
            const currentTable = guest.tableId ? tablesById.get(guest.tableId) : null
            return (
              <li key={guest.id} className="flex items-center justify-between gap-2 py-2 px-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {guest.name} {guest.lastName || ''} {partySize(guest) > 1 && <span className="text-gray-400">(+{partySize(guest) - 1})</span>}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{currentTable ? `En ${currentTable.name}` : 'Sin mesa'}</p>
                </div>
                <AccessibleButton
                  size="sm"
                  variant="secondary"
                  loading={movingId === guest.id}
                  onClick={() => handleAssign(guest.id)}
                >
                  {currentTable ? 'Mover aquí' : 'Asignar'}
                </AccessibleButton>
              </li>
            )
          })}
        </ul>
        <div className="flex justify-end pt-3">
          <AccessibleButton type="button" variant="secondary" onClick={onClose}>Cerrar</AccessibleButton>
        </div>
      </div>
    </AccessibleModal>
  )
}
