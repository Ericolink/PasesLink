// Recordatorio de "tu evento se acerca" — distinto del recordatorio de RSVP
// (rsvp/reminders.ts, que solo persigue a quien no ha confirmado): este va a
// quien YA confirmó (rsvpStatus 'yes'), avisándole que el evento está por
// llegar. Reglas fijas (7 y 1 días antes) en vez de configurables por evento
// como ReminderRulesEditor — decisión consciente para no sumar otro campo a
// EventData/mapEvent() por ahora; si más adelante hace falta que el
// organizador las ajuste, este es el lugar para volverlas configurables.
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { renderBrandedEmail } from '../lib/emailTemplate.js'
import { DAILY_BUDGET_CAP, reserveBudgetSlot, todayDateKey } from '../lib/dailyBudget.js'

const PASELINK_ORIGIN = 'https://www.paselink.com'
const EVENT_REMINDER_DAYS = [7, 1] as const

interface EventWithDate extends DocumentData {
  name?: string
  date?: string
  location?: string
  coverImage?: string
}

// Mismo cálculo que daysUntil en rsvp/reminders.ts (días completos entre
// `today` a medianoche UTC y `dateISO`, negativo si ya pasó).
function daysUntil(dateISO: string, today: Date): number {
  const target = new Date(dateISO)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

function formatEventDate(dateISO: string): string {
  return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(dateISO))
}

export function buildReminderCopy(
  days: number,
  eventName: string,
  dateISO: string,
  location: string | undefined,
  coverImage: string | undefined,
  passUrl: string,
) {
  const whenText = days === 1 ? 'es mañana' : `es en ${days} días`
  const subject = `${eventName} ${whenText}`
  const dateLine = `${formatEventDate(dateISO)}${location ? ` · ${location}` : ''}`
  const bodyHtml = `<p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#374151;">Tu evento <strong>${eventName}</strong> ${whenText}.</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#374151;">${dateLine}</p>`
  return {
    subject,
    html: renderBrandedEmail({
      title: subject,
      bodyHtml,
      ctaText: 'Ver mi pase',
      ctaUrl: passUrl,
      heroImageUrl: coverImage,
      heroImageAlt: eventName,
    }),
  }
}

export interface SendDueEventRemindersResult {
  sent: number
  skipped: number
  failed: number
}

export async function sendDueEventReminders(db: Firestore, now: number): Promise<SendDueEventRemindersResult> {
  const today = new Date(new Date(now).toISOString().slice(0, 10))
  const todayKey = todayDateKey()
  const tally: SendDueEventRemindersResult = { sent: 0, skipped: 0, failed: 0 }

  const eventsSnap = await db.collection('events').where('status', '==', 'active').get()

  for (const eventDoc of eventsSnap.docs) {
    const event = eventDoc.data() as EventWithDate
    if (!event.date) continue

    const daysLeft = daysUntil(event.date, today)
    if (!EVENT_REMINDER_DAYS.includes(daysLeft as (typeof EVENT_REMINDER_DAYS)[number])) continue

    const guestsSnap = await eventDoc.ref.collection('guests').where('rsvpStatus', '==', 'yes').get()
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

      const logRef = eventDoc.ref.collection('sendLog').doc(`eventReminder_${daysLeft}_${guestDoc.id}_${todayKey}`)
      try {
        await logRef.create({
          guestId: guestDoc.id,
          channel: 'email',
          kind: 'event_reminder',
          daysBefore: daysLeft,
          toEmail: email,
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
      const { subject, html } = buildReminderCopy(daysLeft, eventName, event.date, event.location, event.coverImage, passUrl)
      const result = await sendEmail({
        toEmail: email,
        toName: guest.name as string | undefined,
        subject,
        html,
      })

      await logRef.update({ status: result.ok ? 'sent' : 'failed', errorMessage: result.ok ? null : result.error || null })
      if (result.ok) tally.sent += 1
      else tally.failed += 1
    }
  }

  return tally
}
