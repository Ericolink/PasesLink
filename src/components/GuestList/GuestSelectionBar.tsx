import { IconCheck, IconTrash, IconX } from '../Icons'

export function GuestSelectionBar({
  count,
  requiresPayment,
  canConfirmPayments = true,
  canDeleteGuests = true,
  onMarkPaid,
  onDelete,
  onCancel,
}: {
  count: number
  requiresPayment: boolean
  canConfirmPayments?: boolean
  canDeleteGuests?: boolean
  onMarkPaid: () => void
  onDelete: () => void
  onCancel: () => void
}) {
  if (count === 0) return null

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[150] sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-full sm:max-w-md pb-[env(safe-area-inset-bottom)]">
      <div className="bg-gray-900 dark:bg-gray-950 text-white rounded-2xl shadow-2xl px-3 py-2.5 sm:px-4 sm:py-3 flex items-center justify-between gap-2 sm:gap-3 overflow-hidden">
        <span className="text-sm font-semibold truncate min-w-0 flex-1 pl-1 sm:flex-none sm:pl-0">
          {count} seleccionado{count > 1 ? 's' : ''}
        </span>
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {requiresPayment && canConfirmPayments && (
            <button
              type="button"
              onClick={onMarkPaid}
              aria-label="Confirmar pago"
              title="Confirmar pago"
              className="flex items-center justify-center gap-1.5 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2"
            >
              <IconCheck className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold">Confirmar pago</span>
            </button>
          )}
          {canDeleteGuests && (
            <button
              type="button"
              onClick={onDelete}
              aria-label="Borrar"
              title="Borrar"
              className="flex items-center justify-center gap-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg transition-colors w-10 h-10 sm:w-auto sm:h-auto sm:px-3 sm:py-2"
            >
              <IconTrash className="w-4 h-4 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span className="hidden sm:inline text-xs font-semibold">Borrar</span>
            </button>
          )}
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar selección"
            title="Cancelar selección"
            className="flex items-center justify-center bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors w-10 h-10 sm:w-auto sm:h-auto sm:p-2"
          >
            <IconX className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
