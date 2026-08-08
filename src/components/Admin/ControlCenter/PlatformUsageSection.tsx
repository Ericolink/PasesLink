import { usePlatformUsage } from '../../../hooks/usePlatformUsage'
import { MetricTile } from '../../MetricTile'
import { SkeletonBlock } from '../../Skeleton'
import { IconCheckCircle, IconClock, IconTicket, IconUtensils } from '../../accessibility/AccessibleIcon'

const NA = '—'

function pct(part: number | null, total: number | null): string {
  if (part === null || total === null) return NA
  return total > 0 ? `${Math.round((part / total) * 100)}%` : '0%'
}

function fmt(n: number | null): number | string {
  return n === null ? NA : n
}

// Cierra la brecha que dejaba el resto del Centro de Control: eventos/
// usuarios/plantillas ya tienen su sección (Resumen, Analítica de uso), pero
// invitados/check-ins/RSVP/lista de espera/concesiones no existían a nivel
// PLATAFORMA (solo por evento, dentro de Reports). Ver
// src/firebase/platformUsage.ts para las agregaciones server-side detrás de
// esto — ninguna recorre `guests` completo.
export function PlatformUsageSection() {
  const { stats, loading } = usePlatformUsage()

  if (loading || !stats) return <SkeletonBlock className="h-64 rounded-lg" />

  const rsvpTotal =
    stats.rsvpYes !== null && stats.rsvpNo !== null && stats.rsvpPending !== null
      ? stats.rsvpYes + stats.rsvpNo + stats.rsvpPending
      : null
  const eventsTotal =
    stats.activeEvents !== null && stats.cancelledEvents !== null && stats.archivedEvents !== null
      ? stats.activeEvents + stats.cancelledEvents + stats.archivedEvents
      : null

  // Lista de espera y pedidos de concesiones dependen de una regla de
  // firestore.rules aditiva (ver firestore.rules, junto al bloque de
  // collectionGroup de Alertas/Actividad) — mientras no esté deployada,
  // llegan en null y avisamos en vez de mostrar un 0 engañoso.
  const missingWaitlistOrConcessions = stats.activeWaitlistEntries === null || stats.totalConcessionOrders === null

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricTile label="Invitados registrados" value={fmt(stats.totalGuests)} icon={IconTicket} align="start" />
        <MetricTile
          label="Check-ins realizados"
          value={fmt(stats.totalCheckedIn)}
          sub={`${pct(stats.totalCheckedIn, stats.totalGuests)} de los invitados`}
          icon={IconCheckCircle}
          align="start"
          accent="success"
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">RSVP</h3>
          <ul className="space-y-2">
            <RsvpRow label="Sí" count={stats.rsvpYes} total={rsvpTotal} />
            <RsvpRow label="No" count={stats.rsvpNo} total={rsvpTotal} />
            <RsvpRow label="Pendiente" count={stats.rsvpPending} total={rsvpTotal} />
          </ul>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Eventos por estado</h3>
          <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
            <li className="flex justify-between"><span>Activos</span><span className="tabular-nums font-medium text-gray-900 dark:text-white">{fmt(stats.activeEvents)}</span></li>
            <li className="flex justify-between"><span>Cancelados</span><span className="tabular-nums font-medium text-gray-900 dark:text-white">{fmt(stats.cancelledEvents)}</span></li>
            <li className="flex justify-between"><span>Archivados</span><span className="tabular-nums font-medium text-gray-900 dark:text-white">{fmt(stats.archivedEvents)}</span></li>
          </ul>
        </div>

        <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 p-4">
          <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-3">Lista de espera y concesiones</h3>
          <ul className="space-y-2 text-xs text-gray-700 dark:text-gray-300">
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><IconClock className="w-3.5 h-3.5 text-gray-400" />Entradas activas en espera</span>
              <span className="tabular-nums font-medium text-gray-900 dark:text-white">{fmt(stats.activeWaitlistEntries)}</span>
            </li>
            <li className="flex items-center justify-between">
              <span className="flex items-center gap-1.5"><IconUtensils className="w-3.5 h-3.5 text-gray-400" />Eventos con concesiones</span>
              <span className="tabular-nums font-medium text-gray-900 dark:text-white">{pct(stats.concessionsEnabledEvents, eventsTotal)}</span>
            </li>
            <li className="flex justify-between">
              <span>Pedidos de concesiones</span>
              <span className="tabular-nums font-medium text-gray-900 dark:text-white">{fmt(stats.totalConcessionOrders)}</span>
            </li>
          </ul>
          {missingWaitlistOrConcessions && (
            <p className="text-2xs text-gray-400 dark:text-gray-500 mt-2">
              Algunos datos no están disponibles todavía (falta desplegar un permiso nuevo de Firestore).
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function RsvpRow({ label, count, total }: { label: string; count: number | null; total: number | null }) {
  const width = count !== null && total !== null && total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <li className="flex items-center gap-2">
      <span className="text-xs text-gray-700 dark:text-gray-300 w-16 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden">
        <div className="h-full bg-primary rounded-full" style={{ width: `${width}%` }} />
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 tabular-nums w-20 text-right shrink-0">
        {fmt(count)} ({pct(count, total)})
      </span>
    </li>
  )
}
