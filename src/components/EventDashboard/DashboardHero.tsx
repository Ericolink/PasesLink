import type { ReactNode } from 'react'

type HeroTone = 'primary' | 'success' | 'warning' | 'gray'

interface DashboardHeroProps {
  tone?: HeroTone
  title: string
  subtitle?: string
  children?: ReactNode
}

// Shell presentacional del titular de cada etapa del dashboard (ver
// getDashboardStage) — un solo bloque grande en vez de 8 tarjetas del mismo
// peso, para que la pantalla responda primero "¿cómo va mi evento?" antes
// que cualquier cifra secundaria.
const TONE_CLASS: Record<HeroTone, string> = {
  primary: 'bg-primary-subtle dark:bg-gray-800 border-primary-subtle-border dark:border-primary/30 text-primary-ink dark:text-primary',
  success: 'bg-success-subtle dark:bg-gray-800 border-success-ink/20 text-success-ink',
  warning: 'bg-warning-subtle dark:bg-gray-800 border-warning-ink/20 text-warning-ink',
  gray: 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white',
}

export function DashboardHero({ tone = 'gray', title, subtitle, children }: DashboardHeroProps) {
  return (
    <div role="status" className={`border rounded-2xl p-5 mb-5 ${TONE_CLASS[tone]}`}>
      <p className="text-lg sm:text-xl font-bold">{title}</p>
      {subtitle && <p className="text-sm mt-1 opacity-90">{subtitle}</p>}
      {children && <div className="mt-4">{children}</div>}
    </div>
  )
}
