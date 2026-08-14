import type { AdminEventStats, AdminUserStats } from '../../firebase/admin'
import type { EventData } from '../../types'
import type { ManagementTab } from './AdminManagement'
import { DashboardSection } from '../../components/Admin/ControlCenter/DashboardSection'
import { HeroKpiGrid } from '../../components/Admin/ControlCenter/HeroKpiGrid'
import { AlertsPanel } from '../../components/Admin/ControlCenter/AlertsPanel'
import { PlatformHealthPanel } from '../../components/Admin/ControlCenter/PlatformHealthPanel'
import { MaintenanceModePanel } from '../../components/Admin/ControlCenter/MaintenanceModePanel'
import { AdsPanel } from '../../components/Admin/ControlCenter/AdsPanel'
import { GrowthSection } from '../../components/Admin/ControlCenter/GrowthSection'
import { FunnelSection } from '../../components/Admin/ControlCenter/FunnelSection'
import { RecentActivityFeed } from '../../components/Admin/ControlCenter/RecentActivityFeed'
import { UsageAnalyticsSection } from '../../components/Admin/ControlCenter/UsageAnalyticsSection'
import { PlatformUsageSection } from '../../components/Admin/ControlCenter/PlatformUsageSection'
import { DeviceBreakdownSection } from '../../components/Admin/ControlCenter/DeviceBreakdownSection'
import { QuickActionsBar } from '../../components/Admin/ControlCenter/QuickActionsBar'
import {
  IconAlertTriangle,
  IconClock,
  IconGlobe,
  IconMonitor,
  IconSmartphone,
  IconTicket,
  IconTool,
  IconTrendingUp,
  IconUsers,
} from '../../components/accessibility/AccessibleIcon'

interface AdminControlCenterProps {
  events: EventData[]
  eventsLoading: boolean
  eventStats: AdminEventStats | null
  userStats: AdminUserStats | null
  statsLoading: boolean
  onGoToManagement: (tab: ManagementTab) => void
}

// Pantalla de aterrizaje de /admin (ver AdminDashboard.tsx). Responde las
// preguntas del pedido original: ¿crece PaseLink? (Hero+Crecimiento),
// ¿funciona todo? (Alertas+Salud), ¿cómo se usa? (Analítica+Dispositivos+
// Funnel), ¿qué pasa ahora mismo? (Actividad en vivo). Gestión (la otra
// macro-tab) sigue siendo el panel operativo de tablas — acá no hay CRUD,
// solo métricas y monitoreo, tal como se pidió explícitamente.
export function AdminControlCenter({
  events,
  eventsLoading,
  eventStats,
  userStats,
  statsLoading,
  onGoToManagement,
}: AdminControlCenterProps) {
  return (
    <div>
      <DashboardSection title="Acciones rápidas">
        <QuickActionsBar onGoToManagement={onGoToManagement} />
      </DashboardSection>

      <DashboardSection title="Modo mantenimiento" icon={IconTool} description="¿Necesitas bloquear la app mientras hacés cambios?">
        <MaintenanceModePanel />
      </DashboardSection>

      <DashboardSection title="Publicidad" icon={IconGlobe} description="Landing e invitación pública, fase 1 — ver AdSlot.tsx.">
        <AdsPanel />
      </DashboardSection>

      <DashboardSection title="Resumen" icon={IconTrendingUp} description="¿Cómo está el negocio hoy?">
        <HeroKpiGrid eventStats={eventStats} userStats={userStats} loading={statsLoading} />
      </DashboardSection>

      <DashboardSection title="Alertas inteligentes" icon={IconAlertTriangle} description="¿Hay algo que necesite atención ahora mismo?">
        <AlertsPanel />
      </DashboardSection>

      <DashboardSection title="Salud de la plataforma" icon={IconMonitor} description="¿Está todo funcionando técnicamente?">
        <PlatformHealthPanel />
      </DashboardSection>

      <DashboardSection title="Crecimiento" icon={IconTrendingUp} description="¿Está creciendo PaseLink?">
        <GrowthSection />
      </DashboardSection>

      <DashboardSection title="Funnel de activación" icon={IconUsers} description="¿Dónde se pierden los usuarios en el camino a su primer check-in?">
        <FunnelSection />
      </DashboardSection>

      <div className="grid lg:grid-cols-2 gap-6">
        <DashboardSection title="Actividad en tiempo real" icon={IconClock} description="¿Qué está pasando ahora mismo en la plataforma?">
          <RecentActivityFeed />
        </DashboardSection>

        <DashboardSection title="Analítica de uso" icon={IconUsers} description="¿Qué funcionalidades usan más los organizadores?">
          <UsageAnalyticsSection events={events} loading={eventsLoading} />
        </DashboardSection>
      </div>

      <DashboardSection title="Analítica de plataforma" icon={IconTicket} description="¿Cómo usan los invitados PaseLink una vez adentro del evento?">
        <PlatformUsageSection />
      </DashboardSection>

      <DashboardSection title="Dispositivos" icon={IconSmartphone} description="¿Desde qué sistema y navegador entran los organizadores?">
        <DeviceBreakdownSection />
      </DashboardSection>
    </div>
  )
}
