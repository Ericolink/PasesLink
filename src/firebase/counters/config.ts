// Registro central de estrategia por contador — el único lugar que hay que
// tocar para activar sharding en un contador puntual (objetivo: "feature
// flag / configuración centralizada", ver docs/sharded-counters.md). Portado
// en paralelo a functions/src/lib/counters/config.ts (mismo criterio que
// attendeeLimit.ts entre cliente/servidor) porque cliente y Cloud Functions
// son proyectos TypeScript separados sin paquete compartido.
//
// Todos en 'traditional' hoy: ningún contador tiene evidencia real de
// contención todavía (ver checklist de activación en
// docs/sharded-counters.md antes de cambiar cualquiera de estos a 'dual').
import type { CounterRegistry } from './types'

export const COUNTER_REGISTRY: CounterRegistry = {
  checkedInCount: { strategy: 'traditional', shardCount: 10, gated: false },
  occupancyCount: { strategy: 'traditional', shardCount: 10, gated: true },
  peopleCount: { strategy: 'traditional', shardCount: 10, gated: true },
  guestCount: { strategy: 'traditional', shardCount: 10, gated: false },
  paidCount: { strategy: 'traditional', shardCount: 10, gated: false },
  rsvpYesCount: { strategy: 'traditional', shardCount: 10, gated: false },
  rsvpNoCount: { strategy: 'traditional', shardCount: 10, gated: false },
  rsvpPendingCount: { strategy: 'traditional', shardCount: 10, gated: false },
  // Ledger de walk-ins netos (walkIn - walkOut, nunca negativo) — la única
  // porción de checkedInCount/occupancyCount que NO es derivable de
  // guests/ (walkIn/walkOut no crean documento de invitado). Existe para
  // que reconcileGuestCounters.ts pueda recomponer esos dos contadores como
  // "derivado de guests/ + walkInNetCount" en vez de tener que excluirlos
  // de la reconciliación por completo. Ver functions/src/reconciliation/reconcileGuestCounters.ts.
  walkInNetCount: { strategy: 'traditional', shardCount: 10, gated: false },
}
