import { Checkbox } from '../accessibility/AccessibleField/Checkbox'

// Barra compacta que vive dentro del modo selección (GuestList.tsx), arriba
// de la lista: checkbox tri-estado ("Seleccionar todos" / algunos / ninguno)
// + contador. Siempre visible mientras selectMode está activo, a diferencia
// de GuestSelectionBar (la barra flotante de acciones masivas) que se oculta
// con 0 seleccionados — sin esto, "0 seleccionados" no tenía ningún feedback
// visual propio.
export function GuestSelectAllBar({
  checkedState,
  count,
  loading = false,
  onToggleAll,
}: {
  checkedState: 'none' | 'some' | 'all'
  count: number
  // `guests` puede seguir llegando (evento con más invitados que la ventana
  // por default, ver GUEST_WINDOW_DEFAULT) mientras se termina de cargar el
  // resto — deshabilita el control para no seleccionar solo una parte bajo
  // el nombre de "todos".
  loading?: boolean
  onToggleAll: () => void
}) {
  return (
    <div
      role="group"
      aria-label="Selección de invitados"
      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 pl-3 pr-3"
    >
      <label className="flex items-center gap-2.5 min-h-11 cursor-pointer select-none">
        <Checkbox
          checked={checkedState === 'all'}
          indeterminate={checkedState === 'some'}
          disabled={loading}
          onChange={onToggleAll}
          aria-label="Seleccionar todos los invitados"
        />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          {loading ? 'Cargando invitados…' : 'Seleccionar todos'}
        </span>
      </label>
      <span className="text-sm font-semibold text-gray-500 dark:text-gray-400 shrink-0">
        {count} seleccionado{count === 1 ? '' : 's'}
      </span>
    </div>
  )
}
