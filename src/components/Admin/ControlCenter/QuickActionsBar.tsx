import { AccessibleButton } from '../../accessibility/AccessibleButton'
import { useUnreadFeedbackCount } from '../../../hooks/useUnreadFeedbackCount'
// Import de solo-tipo (se borra en build) — la única razón por la que un
// componente de components/ referencia un archivo de pages/.
import type { ManagementTab } from '../../../pages/Admin/AdminManagement'
import { IconCalendar, IconInbox, IconShuffle, IconUsers } from '../../accessibility/AccessibleIcon'

interface QuickActionsBarProps {
  onGoToManagement: (tab: ManagementTab) => void
}

// Solo navegación a destinos que YA existen dentro de Gestión — sin lógica
// nueva. "Ver logs"/"Configuración"/"Estado del sistema" del pedido
// original quedan fuera: no hay una pantalla real a la que llevar todavía
// (logs viven en Sentry/Cloud Logging externos, no hay página de
// configuración de plataforma) — mejor 3 accesos reales que 6 con la mitad
// rotos.
export function QuickActionsBar({ onGoToManagement }: QuickActionsBarProps) {
  const unreadFeedbackCount = useUnreadFeedbackCount()

  return (
    <div className="flex flex-wrap gap-2">
      <AccessibleButton variant="secondary" size="sm" onClick={() => onGoToManagement('events')}>
        <IconCalendar className="w-4 h-4" /> Buscar evento
      </AccessibleButton>
      <AccessibleButton variant="secondary" size="sm" onClick={() => onGoToManagement('users')}>
        <IconUsers className="w-4 h-4" /> Buscar cliente
      </AccessibleButton>
      <AccessibleButton variant="secondary" size="sm" onClick={() => onGoToManagement('feedback')}>
        <IconInbox className="w-4 h-4" /> Buzón{unreadFeedbackCount > 0 ? ` (${unreadFeedbackCount})` : ''}
      </AccessibleButton>
      <AccessibleButton variant="secondary" size="sm" onClick={() => onGoToManagement('templates')}>
        <IconShuffle className="w-4 h-4" /> Administrar plantillas
      </AccessibleButton>
    </div>
  )
}
