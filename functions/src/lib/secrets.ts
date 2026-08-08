// Secret Manager (recién disponible con Blaze) en vez de variables de
// entorno planas — a diferencia de scripts/lib/emailChannel.mjs (que lee
// BREVO_API_KEY de un secret de GitHub Actions inyectado como env var, la
// única opción en plan Spark), acá las Cloud Functions que envían email
// declaran estos secrets en su config (`secrets: [brevoApiKey, ...]`) y
// Firebase los resuelve en runtime — rotables y con log de acceso propio,
// sin vivir en ningún workflow de CI.
import { defineSecret } from 'firebase-functions/params'

export const brevoApiKey = defineSecret('BREVO_API_KEY')
export const brevoSenderEmail = defineSecret('BREVO_SENDER_EMAIL')
// No es un secreto sensible en sí (es un email de destino, no una
// credencial) — vive en Secret Manager igual que el resto para que ninguna
// Cloud Function de notificaciones dependa de variables de entorno planas
// de CI (ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md, objetivo de
// "todas las Cloud Functions consumen únicamente Secret Manager").
export const reportAdminEmail = defineSecret('REPORT_ADMIN_EMAIL')

// WhatsApp Business Platform (Meta Cloud API) — ver lib/waChannel.ts.
// Trámite externo en Meta Business Manager (verificación de negocio, número
// dedicado, plantillas aprobadas) antes de que estos secrets tengan un
// valor real; hasta entonces quedan sin configurar y
// isWhatsAppConfigured() devuelve false (ningún envío se intenta).
export const whatsappAccessToken = defineSecret('WHATSAPP_ACCESS_TOKEN')
export const whatsappPhoneNumberId = defineSecret('WHATSAPP_PHONE_NUMBER_ID')
// Token propio (no lo da Meta) que se configura en el mismo formulario de
// Meta Business Manager donde se registra la URL del webhook — Meta lo
// reenvía tal cual en el GET de verificación (`hub.verify_token`).
export const whatsappWebhookVerifyToken = defineSecret('WHATSAPP_WEBHOOK_VERIFY_TOKEN')
// App Secret de la app de Meta (Configuración básica → App Secret) — firma
// cada POST del webhook (header X-Hub-Signature-256); distinto del access
// token de arriba.
export const whatsappAppSecret = defineSecret('WHATSAPP_APP_SECRET')

// Token de la API de Sentry (Auth Token con scope project:read/event:read),
// DISTINTO del SENTRY_AUTH_TOKEN que ya existe como secret de GitHub Actions
// (ese es para sentry-cli, subir source maps durante el build — su scope
// típico no alcanza para leer issues vía API). Se crea aparte en
// sentry.io → Settings → Auth Tokens y se sube a Secret Manager con
// `firebase functions:secrets:set SENTRY_API_TOKEN` (ver
// docs/platform-health-roadmap.md). Org/proyecto de Sentry ("paselink") no
// son secretos — van como constantes en refreshPlatformHealth.ts.
export const sentryApiToken = defineSecret('SENTRY_API_TOKEN')
