// Barrido diario (Cloud Scheduler, mismo horario que ya usa
// rsvp-reminders.yml: 13:00 UTC) — wrapper fino de sendDueReminders +
// expireDueReconfirmations (functions/src/reconfirm/sweep.ts).
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { expireDueReconfirmations, sendDueReminders } from '../reconfirm/sweep.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

export const sweepReconfirmations = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'UTC', secrets: [brevoApiKey, brevoSenderEmail] },
  () => withScheduledObservability('sweepReconfirmations', async () => {
    const db = getFirestore()
    const now = Date.now()
    await sendDueReminders(db, now)
    await expireDueReconfirmations(db, now)
  }),
)
