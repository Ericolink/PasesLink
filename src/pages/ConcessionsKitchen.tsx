import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEventOnly } from '../hooks/useEventOnly'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { LoadingInline } from '../components/LoadingInline'
import { Tab, TabList, TabPanel, Tabs } from '../components/accessibility/AccessibleTabs'
import { ConcessionFulfillmentQueue } from '../components/Concessions/kitchen/ConcessionFulfillmentQueue'
import { ConcessionAvailabilityPanel } from '../components/Concessions/kitchen/ConcessionAvailabilityPanel'

type KitchenTab = 'queue' | 'availability'

// Ruta exclusiva del Menu Manager (ver RFC §8.2/§Fase 3) — deliberadamente
// NO reutiliza ninguna pieza de ConcessionsManager.tsx (panel del
// organizador): esa pantalla lee/escribe concessionsOrders (dinero,
// comprobantes), esta pantalla ni siquiera lo importa. Un Menu Manager no
// es coorganizador (no aparece en coOrganizersMap), así que tampoco pasa
// por EventDetail — llega acá por un link directo que el organizador le
// comparte (ver "Compartir acceso" en ConcessionStaffPanel).
export function ConcessionsKitchen() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading, error } = useEventOnly(eventId)
  const perms = useEventPermissions(event, user)
  const { isAdmin } = useIsAdmin()
  useDocumentTitle(event ? `Cocina · ${event.name}` : 'Cocina')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const [tab, setTab] = useState<KitchenTab>('queue')

  if (loading) return <LoadingInline label="Cargando…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  const isStaffMember = !!(user && event.concessions?.concessionsStaffMap && user.uid in event.concessions.concessionsStaffMap)
  const canAccess = isStaffMember || perms.manageConcessions || isAdmin
  if (!canAccess) {
    return <ErrorFallbackCTA message="No tienes acceso a la cocina de este evento." />
  }
  if (!event.concessions?.enabled) {
    return <ErrorFallbackCTA message="El módulo de menú no está activo en este evento." />
  }

  return (
    <>
      <ScreenHeader title="Cocina" subtitle={event.name} backTo="/dashboard" templateId={event.templateId} />

      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Secciones de cocina" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          <Tab value="queue" label="Pedidos" />
          <Tab value="availability" label="Disponibilidad" />
        </TabList>
        <TabPanel value="queue">
          <ConcessionFulfillmentQueue eventId={event.id} />
        </TabPanel>
        <TabPanel value="availability">
          <ConcessionAvailabilityPanel eventId={event.id} />
        </TabPanel>
      </Tabs>
    </>
  )
}
