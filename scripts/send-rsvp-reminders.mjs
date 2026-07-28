// Envía recordatorios de RSVP por email a invitados con rsvpStatus 'pending',
// una vez al día, para eventos con remindersEnabled + reglas de
// "días antes de rsvpDeadline" vencidas hoy. Corre vía GitHub Actions cron
// (.github/workflows/rsvp-reminders.yml) — mismo patrón que
// scripts/backup-firestore.mjs (firebase-admin, sin Cloud Functions, plan
// Spark). No importa nada de src/ (convención ya establecida: los scripts
// son standalone).
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { sendEmail } from './lib/emailChannel.mjs'
import { reserveBudgetSlot, todayDateKey } from './lib/dailyBudget.mjs'

const PROJECT_ID = 'app-pases-9e6e7'
const PASELINK_ORIGIN = 'https://www.paselink.com'
const DAILY_BUDGET_CAP = 300 // tope de la cuenta Brevo (plan gratis)

function initFirestore() {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: PROJECT_ID })
    return getFirestore()
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7
  if (!raw) {
    throw new Error('Falta FIREBASE_SERVICE_ACCOUNT_APP_PASES_9E6E7 (o FIRESTORE_EMULATOR_HOST para probar contra el emulador).')
  }
  initializeApp({ credential: cert(JSON.parse(raw)) })
  return getFirestore()
}

function buildPassUrl(eventId, qrToken) {
  return `${PASELINK_ORIGIN}/pass/${eventId}/${qrToken}`
}

// Días completos entre hoy (UTC) y `dateISO` ('YYYY-MM-DD') — negativo si ya pasó.
function daysUntil(dateISO) {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const target = new Date(dateISO)
  return Math.round((target.getTime() - today.getTime()) / 86_400_000)
}

async function processEvent(db, event) {
  const daysLeft = daysUntil(event.rsvpDeadline)
  const dueRules = (event.reminderRules || []).filter((r) => r.daysBeforeDeadline === daysLeft)
  if (dueRules.length === 0) return { sent: 0, skipped: 0, failed: 0 }

  const guestsSnap = await db.collection('events').doc(event.id).collection('guests')
    .where('rsvpStatus', '==', 'pending').get()
  if (guestsSnap.empty) return { sent: 0, skipped: 0, failed: 0 }

  const tally = { sent: 0, skipped: 0, failed: 0 }
  const todayKey = todayDateKey()

  for (const guestDoc of guestsSnap.docs) {
    const guest = guestDoc.data()
    const contactSnap = await db.collection('events').doc(event.id).collection('guestContacts').doc(guestDoc.id).get()
    const email = contactSnap.exists ? contactSnap.data().email : null
    if (!email) {
      tally.skipped++
      continue
    }

    for (const rule of dueRules) {
      const logId = `reminder_${rule.id}_${guestDoc.id}_${todayKey}`
      const logRef = db.collection('events').doc(event.id).collection('sendLog').doc(logId)
      try {
        await logRef.create({
          guestId: guestDoc.id,
          channel: 'email',
          kind: 'reminder',
          ruleId: rule.id,
          toEmail: email,
          subject: `Recordatorio: confirma tu asistencia a ${event.name}`,
          status: 'sent',
          sentAt: new Date(),
        })
      } catch {
        // Ya existe un doc para este guestId+rule+día — ya se envió, no reintentar.
        continue
      }

      const hasBudget = await reserveBudgetSlot(db, todayKey, DAILY_BUDGET_CAP)
      if (!hasBudget) {
        await logRef.update({ status: 'skipped_budget' })
        tally.skipped++
        continue
      }

      const passUrl = buildPassUrl(event.id, guest.qrToken)
      const result = await sendEmail({
        toEmail: email,
        toName: guest.name,
        subject: `Recordatorio: confirma tu asistencia a ${event.name}`,
        html: `<p>Hola ${guest.name},</p><p>Te recordamos que el evento <strong>${event.name}</strong> se acerca y todavía no confirmaste tu asistencia.</p><p><a href="${passUrl}">Confirma aquí</a></p>`,
      })

      if (result.ok) {
        tally.sent++
      } else {
        await logRef.update({ status: 'failed', errorMessage: result.error })
        tally.failed++
      }
    }
  }

  return tally
}

async function main() {
  const db = initFirestore()
  const eventsSnap = await db.collection('events')
    .where('remindersEnabled', '==', true)
    .where('status', '==', 'active')
    .get()

  let totalSent = 0, totalSkipped = 0, totalFailed = 0
  for (const doc of eventsSnap.docs) {
    const event = { id: doc.id, ...doc.data() }
    if (!event.rsvpDeadline) continue
    const { sent, skipped, failed } = await processEvent(db, event)
    totalSent += sent
    totalSkipped += skipped
    totalFailed += failed
  }

  console.log(`Recordatorios de RSVP: ${totalSent} enviados, ${totalSkipped} omitidos, ${totalFailed} fallidos.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
