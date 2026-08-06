// Barrido diario (Cloud Scheduler, mismo horario que ya usa
// rsvp-reminders.yml: 13:00 UTC) — wrapper fino de sendDueReminders +
// expireDueReconfirmations (functions/src/reconfirm/sweep.ts).
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { expireDueReconfirmations, sendDueReminders } from '../reconfirm/sweep.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: mismo motivo que
// sendRsvpReminders.ts (envío de recordatorios) + expireDueReconfirmations
// (una collectionGroup query + una transacción por invitado vencido, sin
// tope explícito). maxInstances: 1 — un solo barrido a la vez.
export const sweepReconfirmations = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'UTC', secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 300, maxInstances: 1 },
  () => withScheduledObservability('sweepReconfirmations', async () => {
    const db = getFirestore()
    const now = Date.now()
    await sendDueReminders(db, now)
    await expireDueReconfirmations(db, now)
  }),
)
