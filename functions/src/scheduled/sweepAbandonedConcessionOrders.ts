// Barrido cada 6 horas — wrapper fino de runAbandonedConcessionOrdersSweep
// (functions/src/concessions/sweepAbandonedOrders.ts). Cloud Scheduler se
// crea/actualiza solo al desplegar esta función (mismo mecanismo que el
// resto de scheduled/*.ts), no requiere GH Actions ni configuración aparte.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { runAbandonedConcessionOrdersSweep } from '../concessions/sweepAbandonedOrders.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: hasta 200 candidatos (limit), cada
// uno su propia transacción de borrado. maxInstances: 1 — un solo barrido a
// la vez.
export const sweepAbandonedConcessionOrders = onSchedule(
  { schedule: '0 */6 * * *', timeZone: 'UTC', timeoutSeconds: 180, maxInstances: 1 },
  () => withScheduledObservability('sweepAbandonedConcessionOrders', async (ctx) => {
    const db = getFirestore()
    const result = await runAbandonedConcessionOrdersSweep(db, Date.now())
    ctx.addContext({ candidates: result.candidates, deleted: result.deleted, skipped: result.skipped })
    if (result.candidates === 0) {
      ctx.logger.debug('sweepAbandonedConcessionOrders: sin pedidos abandonados candidatos, no-op')
      return
    }
    ctx.logger.info(`sweepAbandonedConcessionOrders: ${result.deleted}/${result.candidates} pedidos abandonados eliminados`, {
      skipped: result.skipped,
    })
  }),
)
