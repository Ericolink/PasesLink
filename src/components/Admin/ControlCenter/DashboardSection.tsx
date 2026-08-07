import type { ComponentType, ReactNode } from 'react'

interface DashboardSectionProps {
  title: string
  description?: string
  icon?: ComponentType<{ className?: string }>
  action?: ReactNode
  children: ReactNode
}

// Envoltorio compartido por las 9 secciones del Centro de Control — mismo
// título+ícono+descripción corta arriba de cada bloque, para que la
// densidad de información se sienta consistente en vez de que cada sección
// resuelva su propio header a mano. `description` responde en una línea la
// pregunta que esa sección contesta (pedido explícito: "cada sección debe
// responder una pregunta específica").
export function DashboardSection({ title, description, icon: Icon, action, children }: DashboardSectionProps) {
  return (
    <section className="mb-8">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2">
          {Icon && <Icon className="w-5 h-5 text-gray-400 dark:text-gray-500 mt-0.5 shrink-0" />}
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h2>
            {description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  )
}
