// Barrido diario (Cloud Scheduler, 04:00 UTC — horario distinto al de
// sweepReconfirmations, 13:00 UTC, para no acumular jobs en el mismo
// instante) — wrapper fino de reconcileAllGuestCounters
// (functions/src/reconciliation/reconcileGuestCounters.ts). Ver
// BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §4.4 / FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md
// Fase D.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { reconcileAllGuestCounters } from '../reconciliation/reconcileGuestCounters.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

export const reconcileGuestCounters = onSchedule(
  { schedule: '0 4 * * *', timeZone: 'UTC' },
  () => withScheduledObservability('reconcileGuestCounters', async (ctx) => {
    const db = getFirestore()
    const result = await reconcileAllGuestCounters(db)
    ctx.addContext({ eventsChecked: result.eventsChecked, eventsUpdated: result.eventsUpdated })
    ctx.logger.info(`reconcileGuestCounters: ${result.eventsUpdated}/${result.eventsChecked} eventos corregidos`, { updates: result.updates })
  }),
)
