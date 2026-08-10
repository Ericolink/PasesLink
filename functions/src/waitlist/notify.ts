// Notificación de "se liberó un lugar para ti" — WhatsApp como canal
// primario con caída automática a email (ver §10 de
// WAITLIST_RECONFIRMATION_ARCHITECTURE.md, diseño original, implementado
// ahora que existe la infraestructura de WhatsApp — ver
// lib/notifyGuestMultiChannel.ts). Se llama DESPUÉS de que la transacción
// de attemptPromote ya confirmó (nunca desde adentro de esa transacción —
// un envío es un efecto no-idempotente y las transacciones de Firestore
// pueden reintentar su callback varias veces antes de comprometerse).
import type { Firestore } from 'firebase-admin/firestore'
import { todayDateKey } from '../lib/dailyBudget.js'
import { sendGuestNotification } from '../lib/notifyGuestMultiChannel.js'

const PASELINK_ORIGIN = 'https://www.paselink.com'

export interface OfferedEntry {
  name?: string
  email?: string
  phone?: string
  phoneCountry?: string
  whatsappConsent?: boolean
  waitlistToken?: string
}

// Mismo patrón de dedup que ya usa scripts/send-notifications.mjs: ID
// determinístico + `.create()` — si el trigger de Firestore redispara (son
// at-least-once) o dos caminos concurrentes intentan notificar la misma
// oferta, el segundo choca contra el doc ya creado y no reenvía nada. Un
// solo doc por oferta, sin importar qué canal termine usándose (ver
// sendGuestNotification) — el `channel` final queda registrado en el mismo doc.
export async function sendOfferEmail(db: Firestore, eventId: string, entryId: string, entry: OfferedEntry): Promise<void> {
  console.log('DEBUG sendOfferEmail entry', {
    entryId,
    hasEmail: !!entry.email,
    hasPhone: !!entry.phone,
    whatsappConsent: entry.whatsappConsent,
  })
  if (!entry.email && !entry.phone) return

  const logRef = db.collection('events').doc(eventId).collection('sendLog').doc(`waitlist_offer_${entryId}`)
  try {
    await logRef.create({
      guestId: null,
      kind: 'waitlist_offer',
      status: 'processing',
      sentAt: new Date(),
    })
  } catch (err) {
    console.log('DEBUG sendOfferEmail dedup skip (sendLog ya existía)', { entryId, err: String(err) })
    return
  }

  const eventSnap = await db.collection('events').doc(eventId).get()
  const eventName = (eventSnap.data()?.name as string) || 'tu evento'
  const link = `${PASELINK_ORIGIN}/waitlist/${eventId}?token=${entry.waitlistToken}`

  const outcome = await sendGuestNotification({
    db,
    logRef,
    contact: {
      name: entry.name,
      email: entry.email,
      phone: entry.phone,
      phoneCountry: entry.phoneCountry,
      whatsappConsent: entry.whatsappConsent,
    },
    whatsapp: {
      templateKind: 'waitlist_offer',
      vars: { guestName: entry.name || 'hola', eventName, deadline: 'las próximas 24 horas', link },
    },
    email: {
      subject: `¡Se liberó un lugar para ti en ${eventName}!`,
      html: `<p>Hola${entry.name ? ` ${entry.name}` : ''},</p>
<p>Se liberó un lugar para ti en <strong>${eventName}</strong>.</p>
<p>Confirma tu asistencia cuando puedas desde el siguiente link. Te recomendamos hacerlo pronto: si tarda demasiado, el organizador puede ofrecerle el lugar a la siguiente persona en la fila.</p>
<p><a href="${link}">Confirmar mi lugar</a></p>`,
    },
    budgetDateKey: todayDateKey(),
  })
  console.log('DEBUG sendOfferEmail outcome', { entryId, outcome })
}
