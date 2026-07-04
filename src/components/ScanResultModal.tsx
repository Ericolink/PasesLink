import { useState } from 'react'
import type { ScanFeedback } from '../pages/Scanner'
import { IconAlertTriangle, IconBan, IconCheckCircle, IconCopy, IconHelpCircle, IconLogOut, IconUsers, IconXCircle } from './Icons'
import { useModalA11y } from '../hooks/useModalA11y'

function formatTimestamp(ms: number): string {
  return new Date(ms).toLocaleString('es', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function ScanResultModal({
  feedback,
  onClose,
  onRequestCheckout,
}: {
  feedback: ScanFeedback
  onClose: () => void
  onRequestCheckout?: () => void
}) {
  const [showFirstCheckIn, setShowFirstCheckIn] = useState(false)

  const styles = {
    success: { bg: 'bg-green-600', icon: IconCheckCircle, title: 'Bienvenido/a' },
    already: { bg: 'bg-red-600', icon: IconCopy, title: 'QR ya registrado' },
    invalid: { bg: 'bg-red-600', icon: IconXCircle, title: 'No válido' },
    checkout: { bg: 'bg-blue-600', icon: IconLogOut, title: 'Hasta luego' },
    already_out: { bg: 'bg-amber-500', icon: IconAlertTriangle, title: 'Ya había salido' },
    not_checked_in: { bg: 'bg-amber-500', icon: IconAlertTriangle, title: 'Sin check-in' },
    exit_blocked: { bg: 'bg-red-700', icon: IconBan, title: 'Reingreso no permitido' },
    full: { bg: 'bg-orange-500', icon: IconUsers, title: 'Cupo lleno' },
    not_found: { bg: 'bg-gray-600', icon: IconHelpCircle, title: 'No encontrado' },
    error: { bg: 'bg-red-700', icon: IconAlertTriangle, title: 'Error' },
  }[feedback.type]

  const Icon = styles.icon
  // El padre monta/desmonta este componente (`{feedback && <ScanResultModal .../>}`)
  // en vez de un flag `open` interno — el montaje ya equivale a "abierto".
  const dialogRef = useModalA11y<HTMLDivElement>(true, onClose)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-[env(safe-area-inset-bottom)] sm:pb-0" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={styles.title}
        className={`${styles.bg} text-white rounded-t-3xl sm:rounded-2xl shadow-xl max-w-sm w-full p-8 text-center animate-bounce-in`}
        onClick={(e) => e.stopPropagation()}
      >
        <Icon className="w-14 h-14 mb-3 mx-auto" />
        <h2 className="text-2xl font-semibold mb-2">{styles.title}</h2>
        {feedback.guestName && <p className="text-lg mb-1">{feedback.guestName}</p>}
        {feedback.detail && <p className="text-sm opacity-90">{feedback.detail}</p>}

        {feedback.type === 'already' && feedback.checkedInAt != null && (
          <div className="mt-3">
            {!showFirstCheckIn ? (
              <button
                onClick={() => setShowFirstCheckIn(true)}
                className="text-sm underline opacity-90 hover:opacity-100"
              >
                Ver primer check-in
              </button>
            ) : (
              <p className="text-sm opacity-90">
                Registrado el {formatTimestamp(feedback.checkedInAt)}
                {feedback.checkedInByEmail ? ` por ${feedback.checkedInByEmail}` : ''}
              </p>
            )}
          </div>
        )}

        {feedback.type === 'already' && onRequestCheckout && (
          <button
            onClick={onRequestCheckout}
            className="mt-4 inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-medium w-full justify-center"
          >
            <IconLogOut className="w-4 h-4" />
            ¿Salió del evento?
          </button>
        )}

        <button
          onClick={onClose}
          className="mt-6 bg-white/20 hover:bg-white/30 transition-colors rounded-md px-4 py-3 text-sm font-medium w-full"
        >
          Cerrar
        </button>
      </div>
    </div>
  )
}
