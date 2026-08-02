// Backup nativo mensual de Firestore → Cloud Storage (ver
// docs/firestore-backups.md). Día 1 de cada mes, 30 minutos después del
// diario.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { withScheduledObservability } from '../lib/observability/withObservability.js'
import { runFirestoreExport } from '../backups/exportFirestore.js'

export const backupFirestoreMonthly = onSchedule(
  { schedule: '30 9 1 * *', timeZone: 'UTC', region: 'us-central1', timeoutSeconds: 540, memory: '256MiB' },
  () => withScheduledObservability('backupFirestoreMonthly', (ctx) => runFirestoreExport('monthly', ctx)),
)
