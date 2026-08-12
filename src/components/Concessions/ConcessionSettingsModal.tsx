import { useState } from 'react'
import type { EventData } from '../../types'
import { AccessibleModal } from '../accessibility/AccessibleModal'
import { Tab, TabList, TabPanel, Tabs } from '../accessibility/AccessibleTabs'
import { ConcessionSettingsPanel } from './ConcessionSettingsPanel'
import { ConcessionStaffPanel } from './ConcessionStaffPanel'

interface Props {
  event: EventData
  isAdmin: boolean
  open: boolean
  onClose: () => void
}

type SettingsTab = 'general' | 'staff'

// Contenedor del botón de engranaje (ver ConcessionsManager.tsx) — una vez
// que la configuración inicial ya está completa, "Configuración" deja de
// competir por espacio con Catálogo/Pedidos/Historial: vive acá adentro,
// con "Encargados" como una sub-sección más (ya no un tab propio, ver
// pedido del usuario §4 — los encargados son parte de la configuración).
export function ConcessionSettingsModal({ event, isAdmin, open, onClose }: Props) {
  const [tab, setTab] = useState<SettingsTab>('general')

  return (
    <AccessibleModal open={open} onClose={onClose} label="Configuración de ventas del evento" maxWidth="sm:max-w-lg" className="flex flex-col min-h-0">
      <div className="overflow-y-auto p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Configuración</h2>
        <Tabs value={tab} onChange={setTab}>
          <TabList aria-label="Secciones de configuración" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
            <Tab value="general" label="General" />
            <Tab value="staff" label="Encargados" />
          </TabList>
          <TabPanel value="general">
            <ConcessionSettingsPanel event={event} canManage isAdmin={isAdmin} />
          </TabPanel>
          <TabPanel value="staff">
            <ConcessionStaffPanel event={event} />
          </TabPanel>
        </Tabs>
      </div>
    </AccessibleModal>
  )
}
