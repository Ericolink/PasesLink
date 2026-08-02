// Backup nativo semanal de Firestore → Cloud Storage (ver
// docs/firestore-backups.md). Domingo, 15 minutos después del diario, para
// no competir por la misma ventana de export.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { withScheduledObservability } from '../lib/observability/withObservability.js'
import { runFirestoreExport } from '../backups/exportFirestore.js'

export const backupFirestoreWeekly = onSchedule(
  { schedule: '15 9 * * 0', timeZone: 'UTC', region: 'us-central1', timeoutSeconds: 540, memory: '256MiB' },
  () => withScheduledObservability('backupFirestoreWeekly', (ctx) => runFirestoreExport('weekly', ctx)),
)
