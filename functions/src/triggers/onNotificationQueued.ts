// Procesa la cola de notificaciones (events/{eventId}/notificationQueue,
// encolada desde src/firebase/notifications.ts) por evento en vez de por
// polling — reemplaza scripts/send-notifications.mjs (cron de GitHub
// Actions cada 10 min), ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md
// Fase 1. Hoy solo procesa el canal 'push' (FCM) — 'email'/'whatsapp'
// quedan como canales futuros sin implementar (ver NotificationType en
// lib/notifications.ts), igual que en el script que reemplaza: se ignoran
// en vez de fallar.
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { sendPush } from '../lib/pushChannel.js'
import { withTriggerObservability } from '../lib/observability/withObservability.js'

interface QueuedNotification {
  type: string
  recipientUid: string
  channels?: string[]
  payload?: { title?: string; body?: string; deepLink?: string }
}

// Dedup vía sendLog + `.create()` — mismo patrón que sendOfferEmail
// (waitlist/notify.ts): los triggers de Firestore son at-least-once, así
// que un reintento choca contra el doc ya creado y no reenvía nada. A
// diferencia del script que reemplaza, no hace falta un paso previo de
// "reclamar" el documento vía transacción: ese paso existía para que dos
// corridas de cron superpuestas no procesaran la misma cola, un problema
// que no aplica a un trigger disparado por la creación del documento.
export async function processQueuedNotification(
  db: Firestore,
  notifRef: DocumentReference,
  notif: QueuedNotification,
): Promise<void> {
  const eventRef = notifRef.parent.parent
  if (!eventRef) return

  const logRef = eventRef.collection('sendLog').doc(`${notifRef.id}_push`)
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
    return
  }

  const channels = notif.channels || ['push']
  let anyFailed = false

  if (channels.includes('push')) {
    const userSnap = await db.collection('users').doc(notif.recipientUid).get()
    const tokens: string[] = userSnap.exists ? (userSnap.data()?.fcmTokens ?? []) : []
    const result = await sendPush({
      tokens,
      title: notif.payload?.title || 'PaseLink',
      body: notif.payload?.body || '',
      data: notif.payload?.deepLink ? { deepLink: notif.payload.deepLink } : {},
    })
    if (!result.ok) anyFailed = true
    if (result.invalidTokens.length) {
      await db.collection('users').doc(notif.recipientUid).update({
        fcmTokens: FieldValue.arrayRemove(...result.invalidTokens),
      }).catch(() => {})
    }
  }
  // 'email'/'whatsapp': sin implementar todavía (ver comentario de cabecera).

  const finalStatus = anyFailed ? 'failed' : 'sent'
  await logRef.update({ status: finalStatus })
  await notifRef.update({ status: finalStatus })
}

// Sin memory/timeoutSeconds propios (hereda 256MiB/60s del default global)
// aunque el trabajo real es un solo envío de FCM (o un no-op si el canal no
// es 'push') — ver el mismo comentario en getOfferedWaitlistCount.ts.
// maxInstances por encima del default global: una confirmación de pago en
// lote (bulkSetGuestPaymentStatus) encola una notificación por invitado,
// así que puede haber cientos de estas en paralelo.
export const onNotificationQueued = onDocumentCreated(
  { document: 'events/{eventId}/notificationQueue/{notifId}', maxInstances: 20 },
  (event) => withTriggerObservability(event, 'onNotificationQueued', async () => {
    const snap = event.data
    if (!snap) return
    await processQueuedNotification(getFirestore(), snap.ref, snap.data() as QueuedNotification)
  }),
)
