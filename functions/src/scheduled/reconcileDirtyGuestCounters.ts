// Barrido liviano cada 10 minutos — wrapper fino de
// reconcileDirtyGuestCounters (functions/src/reconciliation/reconcileGuestCounters.ts).
// A diferencia de reconcileGuestCounters.ts (barrido completo, recorre TODOS
// los eventos), acá solo se tocan los eventos que onGuestWritten marcó
// countersDirty desde la última corrida — sin importar cuántos eventos
// existan en total, el costo de este job escala con "cuántos eventos
// tuvieron actividad reciente", no con el tamaño de la base.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { reconcileDirtyGuestCounters } from '../reconciliation/reconcileGuestCounters.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: hasta 200 eventos (limit), cada
// uno con su propia lectura de evento+guests/ y una transacción de
// commit — con margen amplio para no pisarse con la corrida siguiente
// (cada 10 min). maxInstances: 1 — nunca debe haber dos barridos
// corriendo a la vez sobre los mismos eventos marcados countersDirty.
export const reconcileDirtyCounters = onSchedule(
  { schedule: '*/10 * * * *', timeZone: 'UTC', timeoutSeconds: 120, maxInstances: 1 },
  () => withScheduledObservability('reconcileDirtyCounters', async (ctx) => {
    const db = getFirestore()
    const result = await reconcileDirtyGuestCounters(db)
    ctx.addContext({ eventsChecked: result.eventsChecked, eventsUpdated: result.eventsUpdated })
    if (result.eventsChecked === 0) {
      ctx.logger.debug('reconcileDirtyCounters: sin eventos marcados countersDirty, no-op')
      return
    }
    ctx.logger.info(`reconcileDirtyCounters: ${result.eventsUpdated}/${result.eventsChecked} eventos corregidos`, { updates: result.updates })
  }),
)
