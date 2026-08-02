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

  await logRef.update({ status: result.ok ? 'sent' : 'failed' })
}

export const onUserCreated = onDocumentCreated(
  { document: 'users/{uid}', secrets: [brevoApiKey, brevoSenderEmail] },
  async (event) => {
    const snap = event.data
    if (!snap) return
    await sendWelcomeEmailForNewUser(snap.ref, snap.data() as NewUserData)
  },
)
