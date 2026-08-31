// Bienvenida al crear una cuenta — puerto de sendWelcomeEmail (antes en
// src/utils/emailjs.ts, client-side) a un trigger de Firestore sobre la
// creación de users/{uid}. Dispara exactamente una vez por usuario nuevo,
// sea que se haya registrado con email/password (registerWithEmail) o con
// Google la primera vez (loginWithGoogle) — ambos caminos terminan
// escribiendo este documento por primera vez, así que un solo trigger
// alcanza para los dos sin que el cliente tenga que distinguir "es
// usuario nuevo" (antes lo hacía a mano con
// getAdditionalUserInfo(credential)?.isNewUser — onDocumentCreated ya no
// dispara en escrituras posteriores al mismo uid, mismo efecto gratis).
// Ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 4.
import { onDocumentCreated } from 'firebase-functions/v2/firestore'
import type { DocumentReference } from 'firebase-admin/firestore'
import { sendEmail } from '../lib/emailChannel.js'
import { brevoApiKey, brevoSenderEmail } from '../lib/secrets.js'
import { withTriggerObservability } from '../lib/observability/withObservability.js'
import type { ObservabilityContext } from '../lib/observability/withObservability.js'

interface NewUserData {
  email?: string
  displayName?: string
}

// Tablas + estilos inline (no <style> en <head>, no flexbox/grid) porque es
// lo único que renderiza consistente en Gmail/Outlook/Apple Mail — mismo
// motivo por el que la tipografía es system-stack en vez de la fuente
// custom del sitio (los clientes de correo no cargan @font-face de forma
// confiable). Color #D40E52 (no el --color-primary #FF1464 del sitio) por
// contraste AA en texto chico, mismo criterio que --color-primary-ink en
// src/index.css.
function buildWelcomeEmailHtml(displayName?: string): string {
  const greeting = displayName ? `Hola ${displayName},` : 'Hola,'
  return `<div style="background-color:#F4F4F5;padding:32px 16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background-color:#FFFFFF;border-radius:12px;overflow:hidden;">
    <tr>
      <td style="padding:32px 32px 8px 32px;text-align:center;">
        <img src="https://www.paselink.com/Logo.png" alt="PaseLink" width="140" style="display:block;margin:0 auto;max-width:140px;height:auto;" />
      </td>
    </tr>
    <tr>
      <td style="padding:16px 32px 0 32px;">
        <h1 style="margin:0 0 16px 0;font-size:20px;line-height:28px;color:#111827;text-align:center;">Bienvenido a PaseLink</h1>
        <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#374151;">${greeting}</p>
        <p style="margin:0 0 24px 0;font-size:15px;line-height:24px;color:#374151;">Gracias por registrarte en PaseLink. Ya puedes crear tu primer evento o unirte a uno con el código de invitación que te compartieron.</p>
      </td>
    </tr>
    <tr>
      <td style="padding:0 32px 32px 32px;text-align:center;">
        <a href="https://www.paselink.com" style="display:inline-block;background-color:#D40E52;color:#FFFFFF;text-decoration:none;font-size:15px;font-weight:600;padding:12px 28px;border-radius:8px;">Ir a PaseLink</a>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 32px;border-top:1px solid #E5E7EB;text-align:center;">
        <p style="margin:0;font-size:12px;line-height:18px;color:#9CA3AF;">Recibiste este correo porque creaste una cuenta en PaseLink.</p>
      </td>
    </tr>
  </table>
</div>`
}

// Dedup vía sendLog + `.create()` bajo el propio doc del usuario — mismo
// patrón que el resto del módulo de notificaciones, adaptado a un
// documento sin eventId (users/{uid}/sendLog/welcome en vez de
// events/{eventId}/sendLog/...).
export async function sendWelcomeEmailForNewUser(
  userRef: DocumentReference,
  data: NewUserData,
  logger?: ObservabilityContext['logger'],
): Promise<void> {
  if (!data.email) return

  const logRef = userRef.collection('sendLog').doc('welcome')
  try {
    await logRef.create({ channel: 'email', kind: 'welcome', toEmail: data.email, status: 'processing', sentAt: new Date() })
  } catch {
    return
  }

  const result = await sendEmail({
    toEmail: data.email,
    toName: data.displayName,
    subject: 'Bienvenido a PaseLink',
    html: buildWelcomeEmailHtml(data.displayName),
  })

  // Antes se descartaba result.error acá — el motivo real de un fallo
  // quedaba irrecuperable para siempre (ni en Firestore ni en logs). Mismo
  // campo `errorMessage` que ya usa messaging/campaign.ts, para que las
  // Alertas inteligentes del admin (ver src/firebase/adminAlerts.ts) lo
  // muestren sin cambios del lado del cliente.
  if (!result.ok) {
    logger?.warn(`sendWelcomeEmailForNewUser: envío fallido a ${data.email}`, { error: result.error })
  }
  await logRef.update({ status: result.ok ? 'sent' : 'failed', errorMessage: result.error || null })
}

// Sin memory propia (hereda 256MiB del default global) aunque el trabajo
// real es un solo email de bienvenida — ver el mismo comentario en
// getOfferedWaitlistCount.ts. maxInstances moderado (por encima de eventos
// rarísimos como onReportCreated/onAdminWritten): los registros de cuenta
// nueva pueden concentrarse si un evento se vuelve viral, a diferencia de
// los reportes de contenido o las altas de admin.
export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', secrets: [brevoApiKey, brevoSenderEmail], maxInstances: 10 },
  (event) => withTriggerObservability(event, 'onUserCreated', async (ctx) => {
    const snap = event.data
    if (!snap) return
    await sendWelcomeEmailForNewUser(snap.ref, snap.data() as NewUserData, ctx.logger)
  }),
)
