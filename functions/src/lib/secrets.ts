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

// OpenRouteService (recordatorio de "hora de salida recomendada" del pase)
// — a diferencia del resto de este archivo, esta key NO se resuelve en el
// cliente: OpenRouteService no ofrece restricción por dominio/referrer
// (limitación real del proveedor, sin resolver desde 2019 según su propio
// foro), así que dejarla en un VITE_* del bundle significa que cualquiera
// puede copiarla y agotar la cuota gratis de 2000 req/día. Vive acá y el
// cliente la invoca vía Callable (../callable/estimateTravelTime.ts) en vez
// de llamar a HeiGIT directo.
export const openRouteServiceApiKey = defineSecret('OPENROUTESERVICE_API_KEY')

// RATE_LIMIT_HMAC_KEY (clave HMAC de lib/rateLimit.ts) se declara acá recién
// junto con la primera Callable que la use (G1/G2 de P0-4), y DESPUÉS de
// crearla en Secret Manager en cada proyecto (docs/rate-limiting.md §9.1).
// Ojo: firebase-tools resuelve TODOS los defineSecret del código durante el
// descubrimiento del backend — incluso para `deploy --only hosting`, por el
// rewrite /e/** a eventJoinMeta —, así que declararla sin que exista rompe
// cualquier deploy aunque ninguna función la use (pasó en T1).
