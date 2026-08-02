// Envío del pase (link con el QR) al invitado que se autoregistró y dejó
// su email en /events/:id/join — puerto de sendGuestPassEmail (antes en
// src/utils/emailjs.ts, client-side). Llamado desde el callable
// registerWalkInGuest DESPUÉS de que la transacción ya comprometió (nunca
// desde adentro: un envío de email es un efecto no-idempotente y las
// transacciones de Firestore pueden reintentar su callback varias veces
// antes de comprometerse — mismo criterio que sendOfferEmail en
// waitlist/notify.ts). Ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md
// Fase 4.
import type { Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'

const PASELINK_ORIGIN = 'https://www.paselink.com'

export interface SendGuestPassEmailInput {
  eventId: string
  guestId: string
  toEmail: string
  eventName: string
  qrToken: string
}

export async function sendGuestPassEmail(db: Firestore, input: SendGuestPassEmailInput): Promise<void> {
  const logRef = db.collection('events').doc(input.eventId).collection('sendLog').doc(`pass_${input.guestId}`)
  try {
    await logRef.create({
      guestId: input.guestId,
      channel: 'email',
      kind: 'guest_pass',
      toEmail: input.toEmail,
      status: 'processing',
      sentAt: new Date(),
    })
  } catch {
    return
  }

  const passUrl = `${PASELINK_ORIGIN}/pass/${input.eventId}/${input.qrToken}`
  const result = await sendEmail({
    toEmail: input.toEmail,
    subject: `Tu pase para ${input.eventName}`,
    html: `<p>Este es tu pase para <strong>${input.eventName}</strong>.</p><p><a href="${passUrl}">Ver mi pase</a></p>`,
  })

  await logRef.update({ status: result.ok ? 'sent' : 'failed' })
}
