// DEPRECADO (ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 3): el
// trigger de Firestore onMessageCampaignQueued
// (functions/src/triggers/onMessageCampaignQueued.ts) reemplazó a este
// script como despachador primario — procesa la campaña en segundos en vez
// de hasta 10 min de latencia de polling. Este archivo se conserva solo
// como respaldo manual (.github/workflows/mass-messages.yml quedó con
// `workflow_dispatch` únicamente, sin cron) durante el período de
// transición; se borra en la Fase 6 de la migración.
//
// Procesa la cola de mensajería masiva (events/{id}/messageCampaigns con
// status 'queued', encolados desde MassMessageComposer.tsx) y envía el email
// a cada guestId ya congelado en la campaña.
import { cert, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { sendEmail } from './lib/emailChannel.mjs'
import { DAILY_BUDGET_CAP, reserveBudgetSlot, todayDateKey } from './lib/dailyBudget.mjs'
import { renderPlainTextEmailHtml } from './lib/renderPlainTextEmailHtml.mjs'

const PROJECT_ID = 'app-pases-9e6e7'

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

async function claimCampaign(db, campaignRef) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(campaignRef)
    if (!snap.exists || snap.data().status !== 'queued') return false
    tx.update(campaignRef, { status: 'processing' })
    return true
  })
}

async function processCampaign(db, campaignRef, campaign) {
  const eventRef = db.collection('events').doc(campaign.eventId)
  const todayKey = todayDateKey()
  let sent = 0, failed = 0, skippedNoEmail = 0

  for (const guestId of campaign.guestIds) {
    const [guestSnap, contactSnap] = await Promise.all([
      eventRef.collection('guests').doc(guestId).get(),
      eventRef.collection('guestContacts').doc(guestId).get(),
    ])
    if (!guestSnap.exists) continue
    const guest = guestSnap.data()
    const email = contactSnap.exists ? contactSnap.data().email : null

    const logId = `mass_${campaignRef.id}_${guestId}`
    const logRef = eventRef.collection('sendLog').doc(logId)

    if (!email) {
      try {
        await logRef.create({
          guestId, channel: 'email', kind: 'mass_message', campaignId: campaignRef.id,
          toEmail: '', subject: campaign.subject, status: 'skipped_no_email', sentAt: new Date(),
        })
        skippedNoEmail++
      } catch {
        // Ya procesado en una corrida anterior.
      }
      continue
    }

    try {
      await logRef.create({
        guestId, channel: 'email', kind: 'mass_message', campaignId: campaignRef.id,
        toEmail: email, subject: campaign.subject, status: 'sent', sentAt: new Date(),
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
      toName: guest.name,
      subject: campaign.subject,
      html: renderPlainTextEmailHtml(campaign.bodyText),
    })
    if (result.ok) {
      sent++
    } else {
      await logRef.update({ status: 'failed', errorMessage: result.error })
      failed++
    }
  }

  const finalStatus = failed === 0 && skippedNoEmail === 0 ? 'sent' : sent > 0 ? 'partial' : 'failed'
  await campaignRef.update({ status: finalStatus, processedAt: new Date() })
}

async function main() {
  const db = initFirestore()
  const queuedSnap = await db.collectionGroup('messageCampaigns').where('status', '==', 'queued').get()

  let processed = 0
  for (const doc of queuedSnap.docs) {
    const claimed = await claimCampaign(db, doc.ref)
    if (!claimed) continue
    await processCampaign(db, doc.ref, doc.data())
    processed++
  }

  console.log(`Mensajería masiva: ${processed} campaña(s) procesada(s).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
