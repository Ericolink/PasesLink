import type { ReactNode } from 'react'
import { IconX } from './Icons'

interface DialogHeaderProps {
  title: ReactNode
  icon?: ReactNode
  onClose: () => void
  className?: string
}

// Título + botón cerrar de un Modal — ícono de cerrar fijo en w-5 h-5 (antes
// convivía con w-4 h-4 en un outlier, ver hallazgo C5/X7 de la auditoría).
export function DialogHeader({ title, icon, onClose, className = '' }: DialogHeaderProps) {
  return (
    <div className={`flex items-center justify-between gap-3 px-6 pt-5 pb-3 border-b border-gray-100 dark:border-gray-700 shrink-0 ${className}`}>
      <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        {icon}
        {title}
      </h2>
      <button
        onClick={onClose}
        aria-label="Cerrar"
        className="-m-2 min-w-11 min-h-11 inline-flex items-center justify-center shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
      >
        <IconX className="w-5 h-5" />
      </button>
    </div>
  )
}
