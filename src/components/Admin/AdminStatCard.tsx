import type { ComponentType } from 'react'

interface Props {
  label: string
  value: number | string
  icon: ComponentType<{ className?: string }>
  accent?: 'primary' | 'green' | 'amber' | 'gray'
}

const ACCENT_CLASSES: Record<NonNullable<Props['accent']>, string> = {
  primary: 'text-primary',
  green: 'text-green-600 dark:text-green-400',
  amber: 'text-amber-600 dark:text-amber-400',
  gray: 'text-gray-900 dark:text-white',
}

export function AdminStatCard({ label, value, icon: Icon, accent = 'gray' }: Props) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={`w-3.5 h-3.5 ${ACCENT_CLASSES[accent]}`} />
        <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      </div>
      <p className={`text-2xl font-semibold ${ACCENT_CLASSES[accent]}`}>{value}</p>
    </div>
  )
}

export function AdminStatCardSkeleton() {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-800 animate-pulse">
      <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded mb-2" />
      <div className="h-6 w-10 bg-gray-200 dark:bg-gray-700 rounded" />
    </div>
  )
}
