// Versión Admin SDK de enqueueNotification (src/firebase/notifications.ts) —
// mismo documento (events/{eventId}/notificationQueue), no se cross-importa
// el archivo de cliente (ver criterio de runtimes separados en functions/src/index.ts).
import { FieldValue, type Firestore } from 'firebase-admin/firestore'

export type NotificationType = 'payment_confirmed' | 'rsvp_new' | 'event_updated'

interface EnqueueInput {
  eventId: string
  type: NotificationType
  recipientUid: string
  payload: { title: string; body: string; deepLink?: string }
  channels?: ('push' | 'email' | 'whatsapp')[]
}

export async function enqueueNotification(db: Firestore, input: EnqueueInput): Promise<void> {
  await db.collection('events').doc(input.eventId).collection('notificationQueue').add({
    type: input.type,
    recipientUid: input.recipientUid,
    eventId: input.eventId,
    payload: input.payload,
    channels: input.channels || ['push'],
    status: 'queued',
    createdAt: FieldValue.serverTimestamp(),
  })
}
