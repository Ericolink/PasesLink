// Tipos de la abstracción de contadores agregados de `events/{eventId}`. Ver
// docs/sharded-counters.md para el porqué — resumen: el resto del sistema
// llama incrementCounter/getCounterTotal sin saber si el contador vive en un
// solo campo (`traditional`) o repartido en `events/{id}/counterShards/*`
// (`sharded`), para poder activar sharding contador por contador el día que
// haya evidencia real de contención, sin tocar los call sites de nuevo.

// 'dual' es un estado de migración: escribe en campo plano Y shards, sigue
// leyendo del campo plano — sirve para calentar los shards y validar que la
// suma coincide antes del corte real a 'sharded'.
export type CounterStrategy = 'traditional' | 'dual' | 'sharded'

// Los 6 contadores de `events/{id}` en alcance de esta entrega (ver tabla de
// riesgo en docs/sharded-counters.md). Contadores fuera de `events/{id}`
// (concesiones, reacciones, sanciones) no entran en este registro todavía.
export type CounterName =
  | 'checkedInCount'
  | 'occupancyCount'
  | 'peopleCount'
  | 'guestCount'
  | 'paidCount'
  | 'rsvpYesCount'
  | 'rsvpNoCount'
  | 'rsvpPendingCount'
  | 'walkInNetCount'

export interface CounterDefinition {
  strategy: CounterStrategy
  // Cuántos shards usar cuando strategy es 'dual' o 'sharded'. Ignorado en
  // 'traditional'.
  shardCount: number
  // true = este contador se lee dentro de una transacción para decidir si
  // una operación cabe (occupancyCount en walkIn, peopleCount en
  // attendeeLimit). Shardear un gate no reduce contención por sí solo — la
  // lectura de decisión igual necesita sumar todos los shards de forma
  // consistente. Ver "Cuándo NO usar sharded counters" en
  // docs/sharded-counters.md.
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
