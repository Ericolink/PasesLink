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
import { ConcessionOrdersPanel } from '../components/Concessions/ConcessionOrdersPanel'
import { ConcessionFulfillmentQueue } from '../components/Concessions/kitchen/ConcessionFulfillmentQueue'
import { ConcessionAvailabilityPanel } from '../components/Concessions/kitchen/ConcessionAvailabilityPanel'

type StaffTab = 'cashier' | 'prep' | 'availability'

// Ruta compartida por enlace/QR con los encargados de "Ventas del evento"
// (ver ConcessionStaffPanel.tsx/CollaboratorPanel.tsx) — deliberadamente NO
// reutiliza ConcessionsManager.tsx (panel del organizador): esta pantalla se
// adapta al rol de quien la abre. Un encargado de caja ve "Caja" (confirma/
// rechaza pagos, igual que ConcessionOrdersPanel del organizador); uno de
// preparación ve "Preparación"+"Disponibilidad" (qué preparar/entregar,
// nunca dinero ni comprobantes); quien tiene ambos roles ve los tres tabs.
//
// canCashier/canPrep leen directo de `perms` (useEventPermissions), que ya
// resuelve tanto el staff legado (concessions.concessionsStaffMap) como los
// roles nuevos caja/preparación de event.collaborators — antes de la Fase 4
// de ROLES_PERMISSIONS_REDESIGN.md, esta pantalla leía concessionsStaffMap
// directo acá (isConcessionsCashier/isConcessionsPrep), así que un
// colaborador dado de alta por el sistema nuevo no tenía ningún acceso.
export function ConcessionsKitchen() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading, error } = useEventOnly(eventId)
  const perms = useEventPermissions(event, user)
  const { isAdmin } = useIsAdmin()
  const canCashier = perms.confirmPayments || perms.manageConcessions || isAdmin
  const canPrep = perms.prepareOrders || perms.manageConcessions || isAdmin
  const title = canCashier && canPrep ? 'Encargados' : canCashier ? 'Caja' : 'Preparación'
  useDocumentTitle(event ? `${title} · ${event.name}` : title)
  useDashboardTheme(event?.templateId, event?.accentColor)
  const [tab, setTab] = useState<StaffTab>(canCashier ? 'cashier' : 'prep')

  if (loading) return <LoadingInline label="Cargando…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  if (!canCashier && !canPrep) {
    return <ErrorFallbackCTA message="No tienes acceso a este panel de encargados." />
  }
  if (!event.concessions?.enabled) {
    return <ErrorFallbackCTA message="El módulo de ventas no está activo en este evento." />
  }

  return (
    <>
      <ScreenHeader title={title} subtitle={event.name} backTo="/dashboard" templateId={event.templateId} />

      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Secciones de encargados" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          {canCashier && <Tab value="cashier" label="Caja" />}
          {canPrep && <Tab value="prep" label="Preparación" />}
          {canPrep && <Tab value="availability" label="Disponibilidad" />}
        </TabList>
        {canCashier && (
          <TabPanel value="cashier">
            <ConcessionOrdersPanel eventId={event.id} />
          </TabPanel>
        )}
        {canPrep && (
          <TabPanel value="prep">
            <ConcessionFulfillmentQueue eventId={event.id} />
          </TabPanel>
        )}
        {canPrep && (
          <TabPanel value="availability">
            <ConcessionAvailabilityPanel eventId={event.id} />
          </TabPanel>
        )}
      </Tabs>
    </>
  )
}
