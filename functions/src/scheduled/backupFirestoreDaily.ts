// Backup nativo diario de Firestore → Cloud Storage (ver
// docs/firestore-backups.md). Horario elegido para no coincidir con los
// otros jobs de baja demanda del proyecto (reconcileGuestCounters 04:00 UTC,
// backup-firestore.mjs vía GitHub Actions 08:17 UTC, sweepReconfirmations
// 13:00 UTC). timeoutSeconds generoso porque esperamos a que termine la
// operación de export (LRO) para poder loguear duración/tamaño en un solo
// lugar — ver exportFirestore.ts.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { withScheduledObservability } from '../lib/observability/withObservability.js'
import { runFirestoreExport } from '../backups/exportFirestore.js'

export const backupFirestoreDaily = onSchedule(
  { schedule: '0 9 * * *', timeZone: 'UTC', region: 'us-central1', timeoutSeconds: 540, memory: '256MiB' },
  () => withScheduledObservability('backupFirestoreDaily', (ctx) => runFirestoreExport('daily', ctx)),
)
