// Barrido completo semanal (Cloud Scheduler, domingo 04:00 UTC — horario
// distinto al de sweepReconfirmations, 13:00 UTC, para no acumular jobs en
// el mismo instante) — wrapper fino de reconcileAllGuestCounters
// (functions/src/reconciliation/reconcileGuestCounters.ts). Ver
// BLAZE_ENTERPRISE_ARCHITECTURE_AUDIT.md §4.4 / FIRESTORE_RULES_SIMPLIFICATION_AUDIT.md
// Fase D.
//
// Antes corría a diario; bajó a semanal cuando se agregó el barrido liviano
// (scheduled/reconcileDirtyGuestCounters.ts, cada 10 min vía trigger
// onGuestWritten) — ese cubre el caso común (drift detectado minutos
// después de ocurrir), así que este recorrido completo de TODOS los
// eventos + TODOS sus guests/ pasa a ser una red de seguridad final, no el
// mecanismo principal. Correrlo menos seguido reduce lecturas de Firestore
// sin perder cobertura real.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { reconcileAllGuestCounters } from '../reconciliation/reconcileGuestCounters.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

export const reconcileGuestCounters = onSchedule(
  { schedule: '0 4 * * 0', timeZone: 'UTC' },
  () => withScheduledObservability('reconcileGuestCounters', async (ctx) => {
    const db = getFirestore()
    const result = await reconcileAllGuestCounters(db)
    ctx.addContext({ eventsChecked: result.eventsChecked, eventsUpdated: result.eventsUpdated })
    ctx.logger.info(`reconcileGuestCounters: ${result.eventsUpdated}/${result.eventsChecked} eventos corregidos`, { updates: result.updates })
  }),
)
