// Envío de push vía Firebase Cloud Messaging (Feature 5) — mismo criterio
// de "channel" que scripts/lib/emailChannel.mjs (shape de retorno
// {ok, error?}, servidor-only): FCM no requiere Cloud Functions ni el plan
// Blaze, se dispara con firebase-admin/messaging desde el mismo cron de
// GitHub Actions que ya usan send-rsvp-reminders.mjs/send-mass-messages.mjs.
import { getMessaging } from 'firebase-admin/messaging'

// `tokens` puede tener más de uno (un organizador con push activo en
// celular Y notebook). sendEachForMulticast devuelve éxito/fallo por
// token — se junta acá en un solo resultado con `invalidTokens` para que
// el caller pueda podar users/{uid}.fcmTokens (arrayRemove) sin tener que
// reimplementar esa lógica en cada script que use este channel.
export async function sendPush({ tokens, title, body, data }) {
  if (!tokens || tokens.length === 0) {
    return { ok: true, invalidTokens: [] } // no-op silencioso: ver nota en send-notifications.mjs
  }
  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data || {},
    })
    const invalidTokens = []
    response.responses.forEach((r, i) => {
      // Códigos documentados de Firebase Admin como "este token ya no sirve,
      // no reintentar" — no se trata como error del envío en sí.
      if (!r.success && ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(r.error?.code)) {
        invalidTokens.push(tokens[i])
      }
    })
    return { ok: response.successCount > 0 || tokens.length === invalidTokens.length, invalidTokens }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), invalidTokens: [] }
  }
}
