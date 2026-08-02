// Mensajería masiva — puerto de scripts/send-mass-messages.mjs a Cloud
// Functions (ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 3):
// disparado por la creación de la campaña en vez de un poll cada 10 min
// (mejora real de UX, no solo de consolidación — el organizador ve la
// campaña procesada en segundos). Mismo patrón de sendLog + presupuesto
// diario compartido que rsvp/reminders.ts y reconfirm/sweep.ts.
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { reserveBudgetSlot, todayDateKey } from '../lib/dailyBudget.js'
import { renderPlainTextEmailHtml } from '../lib/renderPlainTextEmailHtml.js'

const DAILY_BUDGET_CAP = 300

export interface MessageCampaign {
  eventId: string
  subject: string
  bodyText: string
  guestIds: string[]
}

export async function processMessageCampaign(
  db: Firestore,
  campaignRef: DocumentReference,
  campaign: MessageCampaign,
): Promise<void> {
  const eventRef = db.collection('events').doc(campaign.eventId)
  const todayKey = todayDateKey()
  let sent = 0
  let failed = 0
  let skippedNoEmail = 0

  for (const guestId of campaign.guestIds) {
    const [guestSnap, contactSnap] = await Promise.all([
      eventRef.collection('guests').doc(guestId).get(),
      eventRef.collection('guestContacts').doc(guestId).get(),
    ])
    if (!guestSnap.exists) continue
    const guest = guestSnap.data()
    const email = contactSnap.exists ? (contactSnap.data()?.email as string | undefined) : undefined

    const logId = `mass_${campaignRef.id}_${guestId}`
    const logRef = eventRef.collection('sendLog').doc(logId)

    if (!email) {
      try {
        await logRef.create({
          guestId, channel: 'email', kind: 'mass_message', campaignId: campaignRef.id,
          toEmail: '', subject: campaign.subject, status: 'skipped_no_email', sentAt: new Date(),
        })
        skippedNoEmail += 1
      } catch {
        // Ya procesado en una corrida anterior (dedup, at-least-once).
      }
      continue
    }

    try {
      await logRef.create({
        guestId, channel: 'email', kind: 'mass_message', campaignId: campaignRef.id,
        toEmail: email, subject: campaign.subject, status: 'processing', sentAt: new Date(),
      })
    } catch {
      continue // ya reclamado por una corrida anterior
    }

    const hasBudget = await reserveBudgetSlot(db, todayKey, DAILY_BUDGET_CAP)
    if (!hasBudget) {
      await logRef.update({ status: 'skipped_budget' })
      continue
    }

    const result = await sendEmail({
      toEmail: email,
      toName: guest?.name as string | undefined,
      subject: campaign.subject,
      html: renderPlainTextEmailHtml(campaign.bodyText),
    })
    if (result.ok) {
      await logRef.update({ status: 'sent' })
      sent += 1
    } else {
      await logRef.update({ status: 'failed', errorMessage: result.error })
      failed += 1
    }
  }

  const finalStatus = failed === 0 && skippedNoEmail === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed'
  await campaignRef.update({ status: finalStatus, processedAt: new Date() })
}
