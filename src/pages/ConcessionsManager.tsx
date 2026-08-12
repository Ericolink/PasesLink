import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEventOnly } from '../hooks/useEventOnly'
import { useEventPermissions } from '../hooks/useEventPermissions'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import { useDashboardTheme } from '../hooks/useDashboardTheme'
import { isConcessionsSetupComplete } from '../types/concessions'
import { ScreenHeader } from '../components/ScreenHeader'
import { ErrorFallbackCTA } from '../components/ErrorFallbackCTA'
import { LoadingInline } from '../components/LoadingInline'
import { Tab, TabList, TabPanel, Tabs } from '../components/accessibility/AccessibleTabs'
import { AccessibleButton } from '../components/accessibility/AccessibleButton'
import { IconSettings } from '../components/accessibility/AccessibleIcon'
import { ConcessionCatalogPanel } from '../components/Concessions/ConcessionCatalogPanel'
import { ConcessionOrdersPanel } from '../components/Concessions/ConcessionOrdersPanel'
import { ConcessionSalesHistoryPanel } from '../components/Concessions/ConcessionSalesHistoryPanel'
import { ConcessionSettingsModal } from '../components/Concessions/ConcessionSettingsModal'
import { ConcessionsOnboarding } from '../components/Concessions/ConcessionsOnboarding'

type ConcessionsTab = 'catalog' | 'orders' | 'history'

// Ruta propia (/events/:eventId/menu), mismo criterio que Reportes/Mesas/
// Anfitrión en Vivo (RFC §Fase 1: contenido pesado — fotos, listas — no
// encaja como una sección más apilada dentro de EventDetail). Acceso:
// manageConcessions administra todo; confirmPayments a secas solo ve
// "Pedidos" (mismo criterio que ya usan las Security Rules de
// concessionsOrders/concessionsFulfillment).
//
// Flujo guiado (rediseño "Ventas del evento", antes "Menú"): mientras la
// configuración no esté completa (ver isConcessionsSetupComplete) se
// muestra únicamente el onboarding — nada de Catálogo/Pedidos/Historial
// hasta que el organizador termine el paso 1. Una vez completo,
// "Configuración" (y "Encargados" adentro) deja de ser un tab propio y pasa
// a vivir detrás del botón de engranaje, para no competir visualmente con
// las funciones que se usan seguido.
export function ConcessionsManager() {
  const { eventId } = useParams<{ eventId: string }>()
  const { user } = useAuth()
  const { event, loading, error } = useEventOnly(eventId)
  const { isAdmin } = useIsAdmin()
  useDocumentTitle(event ? `Ventas · ${event.name}` : 'Ventas del evento')
  useDashboardTheme(event?.templateId, event?.accentColor)
  const perms = useEventPermissions(event, user)
  const [tab, setTab] = useState<ConcessionsTab>('catalog')
  const [settingsOpen, setSettingsOpen] = useState(false)

  if (loading) return <LoadingInline label="Cargando…" />
  if (error || !event) return <ErrorFallbackCTA message={error || 'Evento no encontrado.'} tone="error" />

  const canManage = perms.manageConcessions
  const canViewOrders = perms.manageConcessions || perms.confirmPayments
  if (!canManage && !canViewOrders) {
    return <ErrorFallbackCTA message="No tienes acceso a las ventas de este evento." />
  }

  const currency = event.concessions?.currency || event.currency
  const setupComplete = isConcessionsSetupComplete(event.concessions)

  if (!setupComplete) {
    return (
      <>
        <ScreenHeader title="Ventas del evento" subtitle={event.name} backTo={`/events/${event.id}`} templateId={event.templateId} />
        {canManage ? (
          <ConcessionsOnboarding event={event} isAdmin={isAdmin} />
        ) : (
          <p className="text-sm text-gray-500 dark:text-gray-400 py-10 text-center">
            El organizador todavía no terminó de configurar las ventas de este evento.
          </p>
        )}
      </>
    )
  }

  return (
    <>
      <ScreenHeader title="Ventas del evento" subtitle={event.name} backTo={`/events/${event.id}`} templateId={event.templateId} />

      <Tabs value={tab} onChange={setTab}>
        <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 mb-4">
          <TabList aria-label="Secciones de ventas del evento" className="items-center flex-1 min-w-0">
            {canManage && <Tab value="catalog" label="Catálogo" />}
            {canViewOrders && <Tab value="orders" label="Pedidos" />}
            {canManage && <Tab value="history" label="Historial" />}
          </TabList>

          {canManage && (
            <AccessibleButton
              iconOnly
              variant="secondary"
              aria-label="Configuración de ventas del evento"
              onClick={() => setSettingsOpen(true)}
              className="shrink-0"
            >
              <IconSettings className="w-4 h-4" />
            </AccessibleButton>
          )}
        </div>

        {canManage && (
          <TabPanel value="catalog">
            <ConcessionCatalogPanel eventId={event.id} currency={currency} />
          </TabPanel>
        )}

        {canViewOrders && (
          <TabPanel value="orders">
            <ConcessionOrdersPanel eventId={event.id} />
          </TabPanel>
        )}

        {canManage && (
          <TabPanel value="history">
            <ConcessionSalesHistoryPanel eventId={event.id} />
          </TabPanel>
        )}
      </Tabs>

      {canManage && (
        <ConcessionSettingsModal event={event} isAdmin={isAdmin} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      )}
    </>
  )
}
