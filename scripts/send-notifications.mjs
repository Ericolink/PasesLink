// Procesa la cola de notificaciones (events/{id}/notificationQueue con
// status 'queued', encolada desde src/firebase/notifications.ts) y envía
// por cada canal declarado en el documento — hoy solo 'push' vía FCM (ver
// scripts/lib/pushChannel.mjs); 'email'/'whatsapp' quedan como canales
// futuros sin implementar todavía (ver NotificationQueueDoc.channels).
// Corre vía GitHub Actions cron (.github/workflows/send-notifications.yml)
// — mismo patrón que scripts/send-mass-messages.mjs (firebase-admin, sin
// Cloud Functions, plan Spark): el cliente solo ENCOLA, este script es el
// único que despacha.
import { cert, initializeApp } from 'firebase-admin/app'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import { sendPush } from './lib/pushChannel.mjs'

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

async function claimNotification(db, notifRef) {
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(notifRef)
    if (!snap.exists || snap.data().status !== 'queued') return false
    tx.update(notifRef, { status: 'processing' })
    return true
  })
}

async function processNotification(db, notifRef, notif) {
  const logRef = notifRef.parent.parent.collection('sendLog').doc(`${notifRef.id}_push`)
  try {
    await logRef.create({
      guestId: null,
      channel: 'push',
      kind: notif.type,
      recipientUid: notif.recipientUid,
      status: 'processing',
      sentAt: new Date(),
    })
  } catch {
    // Ya se procesó este notifId en una corrida anterior — evita reenviar
    // si el script se corta a mitad de camino y el cron lo retoma.
    await notifRef.update({ status: 'sent' })
    return
  }

  // fcmTokens ausente (organizador nunca activó push, o cuenta sin doc en
  // users/{uid} — ej. co-organizador agregado por email que nunca completó
  // su perfil) se trata como no-op silencioso, no error: ver diseño de la
  // feature, "0 tokens = no-op".
  const userSnap = await db.collection('users').doc(notif.recipientUid).get()
  const tokens = userSnap.exists ? (userSnap.data().fcmTokens || []) : []

  const channels = notif.channels || ['push']
  let anyFailed = false

  if (channels.includes('push')) {
    const result = await sendPush({
      tokens,
      title: notif.payload?.title || 'PaseLink',
      body: notif.payload?.body || '',
      data: notif.payload?.deepLink ? { deepLink: notif.payload.deepLink } : {},
    })
    if (!result.ok) anyFailed = true
    if (result.invalidTokens?.length) {
      await db.collection('users').doc(notif.recipientUid).update({
        fcmTokens: FieldValue.arrayRemove(...result.invalidTokens),
      }).catch(() => {})
    }
  }
  // 'email'/'whatsapp': sin implementar todavía (ver comentario de cabecera)
  // — se ignoran en vez de fallar, así el resto de la cola sigue avanzando.

  await logRef.update({ status: anyFailed ? 'failed' : 'sent' })
  await notifRef.update({ status: anyFailed ? 'failed' : 'sent' })
}

async function main() {
  const db = initFirestore()
  const snap = await db.collectionGroup('notificationQueue').where('status', '==', 'queued').limit(200).get()
  if (snap.empty) {
    console.log('Sin notificaciones pendientes.')
    return
  }

  let sent = 0
  let skipped = 0
  for (const doc of snap.docs) {
    const claimed = await claimNotification(db, doc.ref)
    if (!claimed) {
      skipped++
      continue
    }
    try {
      await processNotification(db, doc.ref, doc.data())
      sent++
    } catch (err) {
      console.error(`Error procesando notificación ${doc.id}:`, err)
      await doc.ref.update({ status: 'failed' }).catch(() => {})
    }
  }
  console.log(`Notificaciones procesadas: ${sent}, ya reclamadas por otra corrida: ${skipped}.`)
}

main().catch((err) => {
  console.error('Error fatal en send-notifications:', err)
  process.exit(1)
})
