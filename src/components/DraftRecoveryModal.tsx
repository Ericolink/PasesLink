import { IconClock } from './Icons'

function minutesAgoLabel(savedAt: number): string {
  const minutes = Math.max(0, Math.round((Date.now() - savedAt) / 60000))
  if (minutes < 1) return 'hace un momento'
  return `hace ${minutes} minuto${minutes === 1 ? '' : 's'}`
}

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
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0">
      <div className="bg-white dark:bg-gray-800 rounded-t-xl sm:rounded-xl shadow-xl sm:max-w-sm w-full p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:pb-6 animate-bounce-in">
        <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
          <IconClock className="w-5 h-5" />
          <h2 className="text-base font-semibold">Tienes un borrador sin guardar</h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
          ¿Continuar con el evento guardado {minutesAgoLabel(savedAt)}?
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={onContinue}
            className="bg-primary text-white rounded-md py-3 text-sm font-medium hover:bg-primary-dark transition-colors"
          >
            Continuar con el borrador
          </button>
          <button
            onClick={onStartOver}
            className="border border-gray-300 dark:border-gray-600 rounded-md py-3 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Descartar y empezar de nuevo
          </button>
        </div>
      </div>
    </div>
  )
}
