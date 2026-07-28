import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from './config'

export type NotificationType = 'payment_confirmed' | 'rsvp_new' | 'event_updated'

interface EnqueueInput {
  eventId: string
  type: NotificationType
  recipientUid: string
  payload: { title: string; body: string; deepLink?: string }
  channels?: ('push' | 'email' | 'whatsapp')[]
}

// Único punto que encola una notificación (Feature 5) — generación de
// eventos separada del envío por diseño: esto solo escribe un documento en
// events/{id}/notificationQueue (ver firestore.rules para las 2 formas de
// autorización distintas según `type`); scripts/send-notifications.mjs
// (cron de GitHub Actions, Admin SDK) es el único que lo lee y despacha por
// canal. Sin Cloud Functions — mismo patrón que messageCampaigns/
// MassMessageComposer.tsx (el cliente encola, un script aparte procesa).
//
// Nunca debe romper el flujo que la llama (confirmar un pago, guardar un
// RSVP): quien la usa debe envolver en try/catch silencioso, nunca `await`
// bloqueante seguido de dejar propagar el error. Ver guests.ts para los
// puntos de enganche.
export async function enqueueNotification(input: EnqueueInput): Promise<void> {
  await addDoc(collection(db, 'events', input.eventId, 'notificationQueue'), {
    type: input.type,
    recipientUid: input.recipientUid,
    eventId: input.eventId,
    payload: input.payload,
    channels: input.channels || ['push'],
    status: 'queued',
    createdAt: serverTimestamp(),
  })
}
