// Recordatorios de RSVP pendiente — puerto de scripts/send-rsvp-reminders.mjs
// a Cloud Functions (ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md
// Fase 2). Misma regla de negocio que el script que reemplaza (eventos con
// remindersEnabled + reglas de "días antes de rsvpDeadline" vencidas hoy);
// estructura calcada de reconfirm/sweep.ts (sendDueReminders) — mismo
// patrón de sendLog + presupuesto diario compartido, ahora también acá.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { DAILY_BUDGET_CAP, reserveBudgetSlot, todayDateKey } from '../lib/dailyBudget.js'

const PASELINK_ORIGIN = 'https://www.paselink.com'

interface ReminderRule {
  id: string
  daysBeforeDeadline: number
}

interface EventWithReminders extends DocumentData {
  rsvpDeadline?: string
  reminderRules?: ReminderRule[]
  name?: string
}

// Días completos entre `today` (medianoche UTC) y `dateISO` ('YYYY-MM-DD')
// — negativo si ya pasó. Mismo cálculo que daysUntil en
// scripts/send-rsvp-reminders.mjs, con `today` como parámetro en vez de
// `new Date()` interno, para que el barrido sea testeable de forma pura.
function daysUntil(dateISO: string, today: Date): number {
  const target = new Date(dateISO)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

export interface SendDueRsvpRemindersResult {
  sent: number
  skipped: number
  failed: number
}

export async function sendDueRsvpReminders(db: Firestore, now: number): Promise<SendDueRsvpRemindersResult> {
  const today = new Date(new Date(now).toISOString().slice(0, 10))
  const todayKey = todayDateKey()
  const tally: SendDueRsvpRemindersResult = { sent: 0, skipped: 0, failed: 0 }

  const eventsSnap = await db.collection('events')
    .where('remindersEnabled', '==', true)
    .where('status', '==', 'active')
    .get()

  for (const eventDoc of eventsSnap.docs) {
    const event = eventDoc.data() as EventWithReminders
    if (!event.rsvpDeadline) continue

    const daysLeft = daysUntil(event.rsvpDeadline, today)
    const dueRules = (event.reminderRules ?? []).filter((r) => r.daysBeforeDeadline === daysLeft)
    if (dueRules.length === 0) continue

    const guestsSnap = await eventDoc.ref.collection('guests').where('rsvpStatus', '==', 'pending').get()
    if (guestsSnap.empty) continue

    const eventName = event.name || 'tu evento'

    for (const guestDoc of guestsSnap.docs) {
      const guest = guestDoc.data() as DocumentData
      const contactSnap = await eventDoc.ref.collection('guestContacts').doc(guestDoc.id).get()
      const email = contactSnap.exists ? (contactSnap.data()?.email as string | undefined) : undefined
      if (!email) {
        tally.skipped += 1
        continue
      }

      for (const rule of dueRules) {
        const logRef = eventDoc.ref.collection('sendLog').doc(`reminder_${rule.id}_${guestDoc.id}_${todayKey}`)
        try {
          await logRef.create({
            guestId: guestDoc.id,
            channel: 'email',
            kind: 'reminder',
            ruleId: rule.id,
            toEmail: email,
            subject: `Recordatorio: confirma tu asistencia a ${eventName}`,
            status: 'processing',
            sentAt: new Date(),
          })
        } catch {
          continue // ya se envió este invitado+regla+día — dedup, no reintentar
        }

        const budgetOk = await reserveBudgetSlot(db, todayKey, DAILY_BUDGET_CAP)
        if (!budgetOk) {
          await logRef.update({ status: 'skipped_budget' })
          tally.skipped += 1
          continue
        }

        const passUrl = `${PASELINK_ORIGIN}/pass/${eventDoc.id}/${guest.qrToken}`
        const result = await sendEmail({
          toEmail: email,
          toName: guest.name as string | undefined,
          subject: `Recordatorio: confirma tu asistencia a ${eventName}`,
          html: `<p>Hola ${guest.name},</p><p>Te recordamos que el evento <strong>${eventName}</strong> se acerca y todavía no confirmaste tu asistencia.</p><p><a href="${passUrl}">Confirma aquí</a></p>`,
        })

        await logRef.update({ status: result.ok ? 'sent' : 'failed' })
        if (result.ok) tally.sent += 1
        else tally.failed += 1
      }
    }
  }

  return tally
}
