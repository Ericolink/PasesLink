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
