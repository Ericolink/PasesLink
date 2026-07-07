import { IconCheck, IconTrash, IconX } from '../Icons'

export function GuestSelectionBar({
  count,
  onMarkPaid,
  onDelete,
  onCancel,
}: {
  count: number
  onMarkPaid: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[150] sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md pb-[env(safe-area-inset-bottom)]">
      <div className="bg-gray-900 dark:bg-gray-950 text-white rounded-2xl shadow-2xl px-4 py-3 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold shrink-0">{count} seleccionado{count > 1 ? 's' : ''}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMarkPaid}
            className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
          >
            <IconCheck className="w-3.5 h-3.5" />
            Marcar pagado
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="flex items-center gap-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg px-3 py-2 text-xs font-semibold transition-colors"
          >
            <IconTrash className="w-3.5 h-3.5" />
            Eliminar
          </button>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar selección"
            className="flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg p-2 transition-colors"
          >
            <IconX className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
