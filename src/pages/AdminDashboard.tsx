import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  getAllEvents,
  getAllUsers,
  getEventStats,
  getUserStats,
  type AdminEventStats,
  type AdminUser,
  type AdminUserStats,
} from '../firebase/admin'
import { useDocumentTitle } from '../hooks/useDocumentTitle'
import type { EventData } from '../types'
import { Tab as TabButton, TabList, TabPanel, Tabs } from '../components/accessibility/AccessibleTabs'
import { ScreenHeader } from '../components/ScreenHeader'
import { AdminManagement, MANAGEMENT_TAB_VALUES, type ManagementTab } from './Admin/AdminManagement'
import { AdminControlCenter } from './Admin/AdminControlCenter'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

type MacroTab = 'control' | 'gestion'

export function AdminDashboard() {
  useDocumentTitle('Admin')
  const [searchParams] = useSearchParams()
  const [events, setEvents] = useState<EventData[]>([])
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [eventStats, setEventStats] = useState<AdminEventStats | null>(null)
  const [userStats, setUserStats] = useState<AdminUserStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  // Incrementarlo vuelve a pedir events/users (botón "Actualizar" de Gestión,
  // y automáticamente tras archivar/cancelar/borrar un evento desde ahí —
  // ver AdminManagement.tsx).
  const [refreshToken, setRefreshToken] = useState(0)

  // Link directo del correo de aviso de reportes (ver
  // functions/src/triggers/onReportCreated.ts): /admin?tab=reports&reportId=X
  // sigue aterrizando directo en Gestión → Reportes con el caso abierto —
  // Centro de Control es la pantalla de aterrizaje solo cuando `?tab` NO
  // coincide con ninguna pestaña de Gestión.
  const [initialManagementTab] = useState<ManagementTab | undefined>(() => {
    const t = searchParams.get('tab')
    return MANAGEMENT_TAB_VALUES.includes(t as ManagementTab) ? (t as ManagementTab) : undefined
  })
  const [initialReportId] = useState(() => searchParams.get('reportId'))
  const [macroTab, setMacroTab] = useState<MacroTab>(() => (initialManagementTab ? 'gestion' : 'control'))
  const [managementTab, setManagementTab] = useState<ManagementTab>(initialManagementTab || 'events')

  // Usado por "Acciones rápidas" del Centro de Control (ver
  // AdminControlCenter → QuickActionsBar) para saltar directo a una pestaña
  // puntual de Gestión, sin pasar por la URL.
  function goToManagement(tab: ManagementTab) {
    setManagementTab(tab)
    setMacroTab('gestion')
  }

  // Auditoría F10: antes eran listeners en vivo (subscribeToAllEvents/
  // subscribeToAllUsers) — cualquier escritura a CUALQUIER evento/usuario de
  // toda la plataforma reenviaba la colección completa a cada admin con el
  // panel abierto. Ahora son lecturas puntuales (getAllEvents/getAllUsers),
  // refrescadas a pedido — ver refreshToken arriba. events/users cargados
  // acá (no en AdminManagement/AdminControlCenter) para que ambas pestañas
  // compartan la misma descarga en vez de duplicarla.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')
    Promise.all([getAllEvents(), getAllUsers()])
      .then(([eventsData, usersData]) => {
        if (cancelled) return
        setEvents(eventsData)
        setUsers(usersData)
      })
      .catch((err) => {
        console.error('Error loading admin data:', err)
        if (!cancelled) setLoadError('No se pudieron cargar los datos del panel. Verifica tu conexión o tus permisos.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [refreshToken])
  /* eslint-enable react-hooks/set-state-in-effect */

  // Tarjetas de resumen del Centro de Control: agregaciones server-side, una
  // sola vez al montar (no en vivo — Firestore no ofrece un listener para
  // agregaciones).
  useEffect(() => {
    let cancelled = false
    Promise.all([getEventStats(), getUserStats(Date.now() - WEEK_MS)])
      .then(([ev, us]) => {
        if (cancelled) return
        setEventStats(ev)
        setUserStats(us)
      })
      .catch((err) => {
        console.error('Error loading admin stats:', err)
      })
      .finally(() => {
        if (!cancelled) setStatsLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  // Memoizado: recorrer eventos+usuarios para construir estos mapas es
  // O(n) — intrascendente hoy, pero deja de serlo con miles de filas si se
  // recalculara en cada render (p.ej. al escribir en el buscador de Gestión).
  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users])
  const eventCountByUser = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) {
      counts.set(event.ownerId, (counts.get(event.ownerId) || 0) + 1)
    }
    return counts
  }, [events])

  if (loadError) return <p className="text-center text-red-500 mt-16">{loadError}</p>

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 animate-fade-in">
      <ScreenHeader title="Panel de administración" subtitle="Visión general de eventos y clientes de PaseLink" backTo="/profile" />

      <Tabs value={macroTab} onChange={setMacroTab}>
        <TabList aria-label="Panel de administración" className="items-center border-b border-gray-200 dark:border-gray-700 mb-4">
          <TabButton value="control" label="Centro de Control" />
          <TabButton value="gestion" label="Gestión" />
        </TabList>

        <TabPanel value="control">
          <AdminControlCenter
            events={events}
            eventsLoading={loading}
            eventStats={eventStats}
            userStats={userStats}
            statsLoading={statsLoading}
            onGoToManagement={goToManagement}
          />
        </TabPanel>

        <TabPanel value="gestion">
          <AdminManagement
            events={events}
            users={users}
            usersById={usersById}
            eventCountByUser={eventCountByUser}
            loading={loading}
            onRefresh={() => setRefreshToken((n) => n + 1)}
            tab={managementTab}
            onTabChange={setManagementTab}
            initialReportId={initialReportId}
          />
        </TabPanel>
      </Tabs>
    </div>
  )
}
