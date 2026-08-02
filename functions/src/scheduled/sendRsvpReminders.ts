// Barrido diario (Cloud Scheduler, mismo horario que ya usaba
// rsvp-reminders.yml: 13:00 UTC) — wrapper fino de sendDueRsvpReminders
// (functions/src/rsvp/reminders.ts), mismo patrón que
// scheduled/sweepReconfirmations.ts. Ver
// NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 2.
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { getFirestore } from 'firebase-admin/firestore'
import { sendDueRsvpReminders } from '../rsvp/reminders.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'

export const sendRsvpReminders = onSchedule(
  { schedule: '0 13 * * *', timeZone: 'UTC', secrets: [brevoApiKey, brevoSenderEmail] },
  async () => {
    const db = getFirestore()
    await sendDueRsvpReminders(db, Date.now())
  },
)
