import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

interface EmptyStateProps {
  icon: ReactNode
  title: string
  description: string
  ctaText?: string
  to?: string
  onAction?: () => void
}

export function EmptyState({ icon, title, description, ctaText, to, onAction }: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <div className="flex justify-center mb-3 text-gray-400">
        {icon}
      </div>
      <p className="font-medium text-gray-900 dark:text-white mb-1">{title}</p>
      <p className="text-sm text-gray-500 mb-5 max-w-xs mx-auto leading-relaxed">{description}</p>
      {to && ctaText && (
        <Link
          to={to}
          className="inline-block bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-primary-dark transition-colors active:scale-95"
        >
          {ctaText}
        </Link>
      )}
      {onAction && ctaText && (
        <button
          onClick={onAction}
          className="inline-block bg-primary text-white rounded-md px-5 py-2 text-sm font-medium hover:bg-primary-dark transition-colors active:scale-95"
        >
          {ctaText}
        </button>
      )}
    </div>
  )
}
