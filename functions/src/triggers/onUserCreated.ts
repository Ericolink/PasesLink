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
    html: `<p>Hola${data.displayName ? ` ${data.displayName}` : ''},</p><p>Gracias por registrarte en PaseLink. Ya puedes crear tu primer evento o unirte a uno con el código de invitación que te compartieron.</p>`,
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
