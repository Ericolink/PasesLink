// Barrido diario de reconfirmación — dos responsabilidades en un mismo
// archivo testeable (extraído del wrapper de `onSchedule`, mismo patrón que
// waitlist/expire.ts): mandar los recordatorios que correspondan hoy, y
// marcar "en riesgo" (expired) a quien venció sin responder. Nunca libera
// un lugar acá — esa es una acción manual del organizador (ver
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md, decisión de esta sesión de NO
// implementar la ventana de gracia automática que recomendaba el RFC
// original).
import type { DocumentData, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { reserveBudgetSlot, todayDateKey } from '../lib/dailyBudget.js'

const DAILY_BUDGET_CAP = 300
const PASELINK_ORIGIN = 'https://www.paselink.com'
const ONE_DAY_MS = 86_400_000

// Mismo criterio de "día completo" que daysUntil en scripts/send-rsvp-reminders.mjs,
// pero sobre timestamps (reconfirmDeadline es number, no 'YYYY-MM-DD') en
// vez de fechas ISO.
function daysUntil(deadlineMs: number, now: number): number {
  const todayStart = Math.floor(now / ONE_DAY_MS)
  const deadlineDay = Math.floor(deadlineMs / ONE_DAY_MS)
  return deadlineDay - todayStart
}

interface ReminderRule {
  id: string
  daysBeforeDeadline: number
}

interface ReconfirmCampaign {
  deadline: number
  reminderRules?: ReminderRule[]
}

export interface SendDueRemindersResult {
  sent: number
  skipped: number
  failed: number
}

export async function sendDueReminders(db: Firestore, now: number): Promise<SendDueRemindersResult> {
  // != null en vez de == true/exists: eventos sin reconfirmCampaign nunca
  // escribieron el campo, así que quedan fuera de esta query sin más
  // (Firestore no matchea != contra un campo ausente).
  const eventsSnap = await db.collection('events').where('reconfirmCampaign', '!=', null).get()

  const tally: SendDueRemindersResult = { sent: 0, skipped: 0, failed: 0 }
  const todayKey = todayDateKey()

  for (const eventDoc of eventsSnap.docs) {
    const campaign = eventDoc.data().reconfirmCampaign as ReconfirmCampaign | undefined
    if (!campaign) continue
    const daysLeft = daysUntil(campaign.deadline, now)
    const dueRules = (campaign.reminderRules ?? []).filter((r) => r.daysBeforeDeadline === daysLeft)
    if (dueRules.length === 0) continue

    const guestsSnap = await eventDoc.ref.collection('guests').where('reconfirmStatus', '==', 'requested').get()
    const eventName = (eventDoc.data().name as string) || 'tu evento'

    for (const guestDoc of guestsSnap.docs) {
      const guest = guestDoc.data() as DocumentData
      const contactSnap = await eventDoc.ref.collection('guestContacts').doc(guestDoc.id).get()
      const email = contactSnap.exists ? (contactSnap.data()?.email as string | undefined) : undefined
      if (!email) {
        tally.skipped += 1
        continue
      }

      for (const rule of dueRules) {
        const logRef = eventDoc.ref.collection('sendLog').doc(`reconfirm_reminder_${rule.id}_${guestDoc.id}_${todayKey}`)
        try {
          await logRef.create({
            guestId: guestDoc.id,
            channel: 'email',
            kind: 'reconfirm_reminder',
            ruleId: rule.id,
            toEmail: email,
            status: 'processing',
            sentAt: new Date(),
          })
        } catch {
          // Ya se procesó este invitado+regla+día — dedup, no reintentar.
          continue
        }

        const budgetOk = await reserveBudgetSlot(db, todayKey, DAILY_BUDGET_CAP)
        if (!budgetOk) {
          await logRef.update({ status: 'skipped_budget' })
          tally.skipped += 1
          continue
        }

        const result = await sendEmail({
          toEmail: email,
          toName: guest.name as string | undefined,
          subject: `Confirma tu asistencia a ${eventName}`,
          html: `<p>Hola${guest.name ? ` ${guest.name}` : ''},</p>
<p>El organizador de <strong>${eventName}</strong> pidió reconfirmar tu asistencia.</p>
<p>Responde antes del plazo para no perder tu lugar.</p>
<p><a href="${PASELINK_ORIGIN}/pass/${eventDoc.id}/${guest.qrToken}">Reconfirmar mi asistencia</a></p>`,
        })

        await logRef.update({ status: result.ok ? 'sent' : 'failed' })
        if (result.ok) tally.sent += 1
        else tally.failed += 1
      }
    }
  }

  return tally
}

export interface ExpireDueReconfirmationsResult {
  expiredCount: number
}

export async function expireDueReconfirmations(db: Firestore, now: number): Promise<ExpireDueReconfirmationsResult> {
  const dueSnap = await db.collectionGroup('guests')
    .where('reconfirmStatus', '==', 'requested')
    .where('reconfirmDeadline', '<=', now)
    .get()

  let expiredCount = 0
  for (const docSnap of dueSnap.docs) {
    // Releído en transacción: el invitado puede estar confirmando desde su
    // pase en el mismo instante que corre este barrido.
    const didExpire = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(docSnap.ref)
      if (!fresh.exists) return false
      const data = fresh.data()!
      if (data.reconfirmStatus !== 'requested' || (data.reconfirmDeadline ?? 0) > now) return false
      tx.update(docSnap.ref, { reconfirmStatus: 'expired' })
      return true
    })
    if (didExpire) expiredCount += 1
  }

  return { expiredCount }
}
