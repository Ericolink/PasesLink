// Notificación de "se liberó un lugar para ti" — único canal en V1 es
// email (ver §10 de WAITLIST_RECONFIRMATION_ARCHITECTURE.md: WhatsApp
// Business API queda diseñado para V2, no se construye ahora). Se llama
// DESPUÉS de que la transacción de attemptPromote ya confirmó (nunca desde
// adentro de esa transacción — un envío de email es un efecto no-idempotente
// y las transacciones de Firestore pueden reintentar su callback varias
// veces antes de comprometerse).
import type { Firestore } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { DAILY_BUDGET_CAP, reserveBudgetSlot, todayDateKey } from '../lib/dailyBudget.js'

const PASELINK_ORIGIN = 'https://www.paselink.com'

export interface OfferedEntry {
  name?: string
  email?: string
  waitlistToken?: string
}

// Mismo patrón de dedup que ya usa scripts/send-notifications.mjs: ID
// determinístico + `.create()` — si el trigger de Firestore redispara (son
// at-least-once) o dos caminos concurrentes intentan notificar la misma
// oferta, el segundo choca contra el doc ya creado y no reenvía nada.
export async function sendOfferEmail(db: Firestore, eventId: string, entryId: string, entry: OfferedEntry): Promise<void> {
  if (!entry.email) return

  const logRef = db.collection('events').doc(eventId).collection('sendLog').doc(`waitlist_offer_${entryId}`)
  try {
    await logRef.create({
      guestId: null,
      channel: 'email',
      kind: 'waitlist_offer',
      toEmail: entry.email,
      status: 'processing',
      sentAt: new Date(),
    })
  } catch {
    return
  }

  const budgetOk = await reserveBudgetSlot(db, todayDateKey(), DAILY_BUDGET_CAP)
  if (!budgetOk) {
    await logRef.update({ status: 'skipped_budget' })
    return
  }

  const eventSnap = await db.collection('events').doc(eventId).get()
  const eventName = (eventSnap.data()?.name as string) || 'tu evento'
  const link = `${PASELINK_ORIGIN}/waitlist/${eventId}?token=${entry.waitlistToken}`

  const result = await sendEmail({
    toEmail: entry.email,
    toName: entry.name,
    subject: `¡Se liberó un lugar para ti en ${eventName}!`,
    html: `<p>Hola${entry.name ? ` ${entry.name}` : ''},</p>
<p>Se liberó un lugar para ti en <strong>${eventName}</strong>.</p>
<p>Confirma tu asistencia cuando puedas desde el siguiente link. Te recomendamos hacerlo pronto: si tarda demasiado, el organizador puede ofrecerle el lugar a la siguiente persona en la fila.</p>
<p><a href="${link}">Confirmar mi lugar</a></p>`,
  })

  await logRef.update({ status: result.ok ? 'sent' : 'failed' })
}
