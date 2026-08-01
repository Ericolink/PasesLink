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
import { ConcessionCatalogPanel } from '../components/Concessions/ConcessionCatalogPanel'
import { ConcessionOrdersPanel } from '../components/Concessions/ConcessionOrdersPanel'
import { ConcessionSettingsPanel } from '../components/Concessions/ConcessionSettingsPanel'
import { ConcessionStaffPanel } from '../components/Concessions/ConcessionStaffPanel'

type ConcessionsTab = 'catalog' | 'orders' | 'settings' | 'staff'

// Ruta propia (/events/:eventId/menu), mismo criterio que Reportes/Mesas/
// Anfitrión en Vivo (RFC §Fase 1: contenido pesado — fotos, listas — no
// encaja como una sección más apilada dentro de EventDetail). Acceso:
// manageConcessions administra todo; confirmPayments a secas solo ve
// "Pedidos" (mismo criterio que ya usan las Security Rules de
// concessionsOrders/concessionsFulfillment).
export function ConcessionsManager() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading, error } = useEventOnly(eventId)
  const { isAdmin } = useIsAdmin()
  useDocumentTitle(event ? `Menú · ${event.name}` : 'Menú')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const perms = useEventPermissions(event, user)
  const [tab, setTab] = useState<ConcessionsTab>('catalog')

  if (loading) return <LoadingInline label="Cargando…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  const canManage = perms.manageConcessions
  const canViewOrders = perms.manageConcessions || perms.confirmPayments
  if (!canManage && !canViewOrders) {
    return <ErrorFallbackCTA message="No tienes acceso al menú de este evento." />
  }

  const moduleEnabled = !!event.concessions?.enabled
  const currency = event.concessions?.currency || event.currency

  return (
    <>
      <ScreenHeader title="Menú" subtitle={event.name} backTo={`/events/${event.id}`} templateId={event.templateId} />

      <Tabs value={tab} onChange={setTab}>
        <TabList aria-label="Secciones del menú" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          {canManage && <Tab value="catalog" label="Catálogo" />}
          {canViewOrders && <Tab value="orders" label="Pedidos" />}
          {canManage && <Tab value="settings" label="Configuración" />}
          {canManage && <Tab value="staff" label="Encargados" />}
        </TabList>

        {canManage && (
          <TabPanel value="catalog">
            {moduleEnabled ? (
              <ConcessionCatalogPanel eventId={event.id} currency={currency} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                Activa el módulo desde "Configuración" para empezar a cargar productos.
              </p>
            )}
          </TabPanel>
        )}

        {canViewOrders && (
          <TabPanel value="orders">
            {moduleEnabled ? (
              <ConcessionOrdersPanel eventId={event.id} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">El módulo todavía no está activo.</p>
            )}
          </TabPanel>
        )}

        {canManage && (
          <TabPanel value="settings">
            <ConcessionSettingsPanel event={event} canManage={canManage} isAdmin={isAdmin} />
          </TabPanel>
        )}

        {canManage && (
          <TabPanel value="staff">
            {moduleEnabled ? (
              <ConcessionStaffPanel event={event} />
            ) : (
              <p className="text-sm text-gray-500 dark:text-gray-400 py-6 text-center">
                Activa el módulo desde "Configuración" para agregar encargados.
              </p>
            )}
          </TabPanel>
        )}
      </Tabs>
    </>
  )
}
