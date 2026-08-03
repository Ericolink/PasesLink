// Instrumentación de contadores — deliberadamente standalone (no usa
// createLogger(RequestContext) de ../observability/logger.ts) porque los
// servicios de contadores (checkIn.ts, confirmPayment.ts, etc.) son
// funciones puras que hoy no reciben un RequestContext; enhebrar uno solo
// para esto habría significado tocar la firma de todos esos servicios sin
// necesidad real, ver docs/sharded-counters.md.
//
// Solo escribe logs cuando un contador está en 'dual'/'sharded' (shard
// escrito o drift detectado) — bajo 'traditional' (el 100% de los
// contadores hoy) esta función nunca se llama, cero costo/ruido agregado en
// el camino caliente de check-in/pago.
import { logger as functionsLogger } from 'firebase-functions/logger'
import type { CounterObservation } from './types.js'

export function logCounterObservation(observation: CounterObservation): void {
  functionsLogger.write({
    severity: observation.cacheDriftDetected ? 'WARNING' : 'INFO',
    message: `Contador shardeado: ${observation.counter}`,
    timestamp: new Date().toISOString(),
    type: 'sharded_counter_observation',
    ...observation,
  })
}
