// WhatsApp como canal primario con caída automática a email — un solo
// lugar para esta lógica (ver WAITLIST_RECONFIRMATION_ARCHITECTURE.md
// §10.5) en vez de reimplementarla en waitlist/notify.ts y
// reconfirm/sweep.ts por separado. El caller sigue dueño del `sendLog`
// (crea el doc con `.create()` ANTES de llamar acá — mismo patrón de
// idempotencia ya establecido, id determinístico por evento+invitado+tipo+
// día) porque cada caller tiene su propio esquema de id; esta función solo
// decide QUÉ canal usar y deja el resultado final en ese mismo doc.
import type { DocumentReference, Firestore } from 'firebase-admin/firestore'
import { sendEmail } from './emailChannel.js'
import { isWhatsAppConfigured, sendWhatsAppTemplate } from './waChannel.js'
import type { WhatsAppTemplateKind } from './whatsappTemplates.js'
import { DAILY_BUDGET_CAP, WHATSAPP_DAILY_BUDGET_CAP, reserveBudgetSlot } from './dailyBudget.js'
import { redactPhone } from './phone.js'

export interface GuestChannelContact {
  name?: string
  phone?: string
  phoneCountry?: string
  // Ver GuestData.whatsappConsent (src/types/index.ts) — sin esto en
  // `true`, WhatsApp nunca se intenta, sin importar si hay teléfono
  // cargado (§5 del issue: consentimiento, no solo disponibilidad del dato).
  whatsappConsent?: boolean
  email?: string
}

export type SendGuestNotificationOutcome = 'sent' | 'failed' | 'skipped_budget' | 'skipped_no_channel'

export interface SendGuestNotificationInput {
  db: Firestore
  logRef: DocumentReference
  contact: GuestChannelContact
  whatsapp: { templateKind: WhatsAppTemplateKind; vars: Record<string, string> }
  email: { subject: string; html: string }
  // Mismo `todayDateKey()` que ya usa el caller para su propio dedup — acá
  // se namespacea por canal (`${budgetDateKey}_whatsapp`) para no compartir
  // cupo con el presupuesto de Brevo.
  budgetDateKey: string
}

export async function sendGuestNotification({
  db,
  logRef,
  contact,
  whatsapp,
  email,
  budgetDateKey,
}: SendGuestNotificationInput): Promise<SendGuestNotificationOutcome> {
  if (contact.whatsappConsent === true && contact.phone && isWhatsAppConfigured()) {
    const waBudgetOk = await reserveBudgetSlot(db, `${budgetDateKey}_whatsapp`, WHATSAPP_DAILY_BUDGET_CAP)
    if (waBudgetOk) {
      const result = await sendWhatsAppTemplate({
        toPhone: contact.phone,
        toPhoneCountry: contact.phoneCountry,
        templateKind: whatsapp.templateKind,
        vars: whatsapp.vars,
      })
      if (result.ok) {
        console.log('DEBUG sendGuestNotification whatsapp ok', { providerMessageId: result.providerMessageId })
        await logRef.update({
          status: 'sent',
          channel: 'whatsapp',
          toPhoneRedacted: redactPhone(contact.phone),
          providerMessageId: result.providerMessageId ?? null,
        })
        return 'sent'
      }
      console.log('DEBUG sendGuestNotification whatsapp failed', { errorCode: result.errorCode, error: result.error })
      // Fallo de WhatsApp (número sin cuenta, plantilla rechazada, token
      // vencido, rate limit) → cae a email en el mismo intento, un solo
      // try/catch con respaldo explícito (§10.5 del RFC), nunca dos caminos
      // separados que haya que disparar aparte.
      await logRef.update({ whatsappErrorCode: result.errorCode ?? 'unknown' }).catch(() => {})
    } else {
      console.log('DEBUG sendGuestNotification whatsapp budget exhausted')
      await logRef.update({ whatsappErrorCode: 'budget_exhausted' }).catch(() => {})
    }
  } else {
    console.log('DEBUG sendGuestNotification whatsapp skipped (condición no cumplida)', {
      whatsappConsent: contact.whatsappConsent,
      hasPhone: !!contact.phone,
      configured: isWhatsAppConfigured(),
    })
  }

  if (contact.email) {
    const budgetOk = await reserveBudgetSlot(db, budgetDateKey, DAILY_BUDGET_CAP)
    if (!budgetOk) {
      await logRef.update({ status: 'skipped_budget', channel: 'email' })
      return 'skipped_budget'
    }
    const result = await sendEmail({
      toEmail: contact.email,
      toName: contact.name,
      subject: email.subject,
      html: email.html,
    })
    await logRef.update({ status: result.ok ? 'sent' : 'failed', channel: 'email', toEmail: contact.email })
    return result.ok ? 'sent' : 'failed'
  }

  await logRef.update({ status: 'skipped_no_channel', channel: 'none' })
  return 'skipped_no_channel'
}
