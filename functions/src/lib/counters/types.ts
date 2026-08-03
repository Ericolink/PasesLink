// Puerto Node de src/firebase/counters/types.ts — mismo criterio de
// duplicación que functions/src/lib/attendeeLimit.ts ya usa entre cliente/
// servidor (proyectos TS separados, sin paquete compartido). Mantener los
// dos registros en sync a mano si se agrega/retira un contador.
export type CounterStrategy = 'traditional' | 'dual' | 'sharded'

export type CounterName =
  | 'checkedInCount'
  | 'occupancyCount'
  | 'peopleCount'
  | 'guestCount'
  | 'paidCount'
  | 'rsvpYesCount'
  | 'rsvpNoCount'
  | 'rsvpPendingCount'

export interface CounterDefinition {
  strategy: CounterStrategy
  shardCount: number
  gated: boolean
}

export type CounterRegistry = Record<CounterName, CounterDefinition>

export interface CounterObservation {
  counter: CounterName
  eventId: string
  strategy: CounterStrategy
  durationMs: number
  shardsWritten?: number
  cacheDriftDetected?: boolean
}
