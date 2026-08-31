// Barrido diario de "tu evento se acerca" (7 y 1 días antes), a 15 min de
// sendRsvpReminders (13:15 en vez de 13:00 UTC) para no chocar ambos en la
// misma transacción de sendBudget/{today} al mismo segundo — comparten el
// mismo cupo diario de Brevo (DAILY_BUDGET_CAP), así que igual conviene que
// no arranquen exactamente juntos.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { sendDueEventReminders } from '../event/upcomingReminders.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

export const sendEventReminders = onSchedule(
  { schedule: '15 13 * * *', timeZone: 'UTC', secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 300, maxInstances: 1 },
  () => withScheduledObservability('sendEventReminders', async () => {
    const db = getFirestore()
    await sendDueEventReminders(db, Date.now())
  }),
)
