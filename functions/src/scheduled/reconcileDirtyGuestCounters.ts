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

export const reconcileDirtyCounters = onSchedule(
  { schedule: '*/10 * * * *', timeZone: 'UTC' },
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
