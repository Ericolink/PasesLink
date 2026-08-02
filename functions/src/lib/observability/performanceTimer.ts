// Cronómetro standalone para medir sub-operaciones puntuales. Los wrappers
// de withObservability.ts ya miden la duración total de cada función
// automáticamente vía RequestContext.elapsedMs() — este utilitario queda
// disponible para instrumentar pasos específicos a futuro (p. ej. un
// tramo lento dentro de un barrido) sin depender del contexto completo.
export interface PerformanceTimer {
  elapsedMs(): number
}

export function startTimer(): PerformanceTimer {
  const startedAt = process.hrtime.bigint()
  return {
    elapsedMs() {
      const elapsedNs = process.hrtime.bigint() - startedAt
      return Number(elapsedNs / 1_000_000n)
    },
  }
}

export const SLOW_OPERATION_THRESHOLD_MS = 1000
