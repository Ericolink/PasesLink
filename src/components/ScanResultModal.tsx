import type { ScanFeedback } from '../pages/Scanner'
import { IconAlertTriangle, IconCheckCircle, IconLogOut, IconXCircle } from './Icons'

export function ScanResultModal({ feedback, onClose }: { feedback: ScanFeedback; onClose: () => void }) {
  const styles = {
    success: { bg: 'bg-green-600', icon: IconCheckCircle, title: 'Bienvenido/a' },
    already: { bg: 'bg-amber-500', icon: IconAlertTriangle, title: 'QR ya registrado' },
    invalid: { bg: 'bg-red-600', icon: IconXCircle, title: 'No válido' },
    checkout: { bg: 'bg-blue-600', icon: IconLogOut, title: 'Hasta luego' },
    already_out: { bg: 'bg-amber-500', icon: IconAlertTriangle, title: 'Ya había salido' },
    not_checked_in: { bg: 'bg-amber-500', icon: IconAlertTriangle, title: 'Sin check-in' },
  }[feedback.type]

  const Icon = styles.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className={`${styles.bg} text-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center`}>
        <Icon className="w-14 h-14 mb-3 mx-auto" />
        <h2 className="text-2xl font-semibold mb-2">{styles.title}</h2>
        {feedback.guestName && <p className="text-lg mb-1">{feedback.guestName}</p>}
        {feedback.detail && <p className="text-sm opacity-90">{feedback.detail}</p>}
        <button
          onClick={onClose}
          className="mt-6 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-2 text-sm font-medium"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
