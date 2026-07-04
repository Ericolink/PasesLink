import { IconLogOut, IconRotateCcw, IconXCircle } from './Icons'
import { useModalA11y } from '../hooks/useModalA11y'

export type PendingExit = {
  qrToken: string
  guestName: string
  companionsCount: number
}

export function ExitConfirmDialog({
  pendingExit,
  onVolvera,
  onSeRetira,
  onCancel,
  submitting,
}: {
  pendingExit: PendingExit
  onVolvera: () => void
  onSeRetira: () => void
  onCancel: () => void
  submitting: boolean
}) {
  const dialogRef = useModalA11y<HTMLDivElement>(true, onCancel)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0" onClick={onCancel}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Registrar salida"
        className="bg-gray-800 text-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-sm w-full p-8 text-center animate-bounce-in"
        onClick={(e) => e.stopPropagation()}
      >
        <IconLogOut className="w-14 h-14 mb-3 mx-auto" />
        <h2 className="text-2xl font-semibold mb-1">Registrar salida</h2>
        <p className="text-lg mb-1">{pendingExit.guestName}</p>
        {pendingExit.companionsCount > 0 && (
          <p className="text-sm opacity-80 mb-1">+{pendingExit.companionsCount} acompañante(s)</p>
        )}
        <p className="text-sm opacity-80 mb-6">¿Va a volver a entrar o se retira del evento?</p>

        <div className="flex flex-col gap-2.5">
          <button
            onClick={onVolvera}
            disabled={submitting}
            className="min-h-14 inline-flex items-center justify-center gap-2 bg-primary hover:opacity-90 transition-opacity rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <IconRotateCcw className="w-4 h-4" />
            Volverá
          </button>
          <button
            onClick={onSeRetira}
            disabled={submitting}
            className="min-h-14 inline-flex items-center justify-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-semibold disabled:opacity-50"
          >
            <IconXCircle className="w-4 h-4" />
            Se retira del evento
          </button>
          <button
            onClick={onCancel}
            disabled={submitting}
            className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2 mt-1 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}
