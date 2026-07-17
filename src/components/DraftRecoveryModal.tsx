import { IconClock } from './Icons'
import { Button } from './Button'
import { Modal } from './Modal'

function minutesAgoLabel(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000))
  if (minutes < 1) return 'hace un momento'
  return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`
}

// Sin botón de cerrar a propósito: es una decisión forzada (continuar el
// borrador o descartarlo), no un modal que se pueda "cancelar" sin elegir.
// Por eso Escape no dispara ninguna de las dos acciones (no-op) — solo se usa
// useModalA11y (vía Modal) por el focus trap y la devolución de foco al
// cerrar, no por el cierre con teclado. Por el mismo motivo, tampoco cierra
// al hacer click en el backdrop (default de <Modal>, pero acá `onClose` es
// un no-op así que el click afuera tampoco hace nada).
export function DraftRecoveryModal({
  savedAt,
  onContinue,
  onStartOver,
}: {
  savedAt: number
  onContinue: () => void
  onStartOver: () => void
}) {
  return (
    <Modal open onClose={() => {}} label="Tienes un borrador sin guardar">
      <div className="p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6">
        <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
          <IconClock className="w-5 h-5" />
          <h2 className="text-base font-semibold">Tienes un borrador sin guardar</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          ¿Continuar con el evento guardado {minutesAgoLabel(savedAt)}?
        </p>
        <div className="flex flex-col gap-2">
          <Button variant="primary" onClick={onContinue}>
            Continuar con el borrador
          </Button>
          <Button variant="secondary" onClick={onStartOver}>
            Descartar y empezar de nuevo
          </Button>
        </div>
      </div>
    </Modal>
  )
}
