// Barrido diario (Cloud Scheduler, mismo horario que ya usaba
// rsvp-reminders.yml: 13:00 UTC) — wrapper fino de sendDueRsvpReminders
// (functions/src/rsvp/reminders.ts). Ver
// NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 2.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { sendDueRsvpReminders } from '../rsvp/reminders.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withScheduledObservability } from '../lib/observability/withObservability.js'

// timeoutSeconds por encima del default: recorre eventos+invitados
// pendientes y manda hasta DAILY_BUDGET_CAP (300) emails secuenciales por
// Brevo. maxInstances: 1 — un solo barrido diario a la vez (además,
// reserveBudgetSlot ya serializa sobre el mismo doc de presupuesto).
export const sendRsvpReminders = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'UTC', secrets: [brevoApiKey, brevoSenderEmail], timeoutSeconds: 300, maxInstances: 1 },
  () => withScheduledObservability('sendRsvpReminders', async () => {
    const db = getFirestore()
    await sendDueRsvpReminders(db, Date.now())
  }),
)
