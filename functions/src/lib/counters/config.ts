// Puerto Node de src/firebase/counters/config.ts — DEBE mantenerse idéntico
// al registro del cliente (mismos contadores, misma estrategia). Es el único
// lugar que hay que tocar para activar sharding en un contador puntual, ver
// docs/sharded-counters.md.
//
// Todos en 'traditional' hoy: ningún contador tiene evidencia real de
// contención todavía (ver checklist de activación en
// docs/sharded-counters.md antes de cambiar cualquiera de estos a 'dual').
import type { CounterRegistry } from './types.js'

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
