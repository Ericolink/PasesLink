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
}
