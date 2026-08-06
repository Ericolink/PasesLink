// Barrido diario (Cloud Scheduler, 04:30 UTC — 30 min después de
// reconcileGuestCounters para no acumular jobs en el mismo instante) —
// wrapper fino de reconcileAllShardedCounterCaches
// (functions/src/reconciliation/reconcileShardedCounterCache.ts). No hace
// nada (retorna de inmediato) mientras ningún contador esté en
// 'dual'/'sharded' en lib/counters/config.ts — ver docs/sharded-counters.md.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { reconcileAllShardedCounterCaches } from '../reconciliation/reconcileShardedCounterCache.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: corta temprano (costo ~$0)
// mientras ningún contador esté en 'dual'/'sharded', pero si se activa
// alguno recorre TODOS los eventos × shards. maxInstances: 1 — un solo
// barrido a la vez.
export const reconcileShardedCounters = onSchedule(
  { schedule: '30 4 * * *', timeZone: 'UTC', timeoutSeconds: 180, maxInstances: 1 },
  () => withScheduledObservability('reconcileShardedCounters', async (ctx) => {
    const db = getFirestore()
    const result = await reconcileAllShardedCounterCaches(db)
    ctx.addContext({ countersActive: result.countersActive, eventsChecked: result.eventsChecked, cellsUpdated: result.cellsUpdated })
    if (result.countersActive.length === 0) {
      ctx.logger.debug('reconcileShardedCounters: sin contadores en dual/sharded, no-op')
      return
    }
    ctx.logger.info(`reconcileShardedCounters: ${result.cellsUpdated} cachés corregidas de ${result.eventsChecked} eventos`)
  }),
)
