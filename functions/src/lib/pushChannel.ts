// Envío de push vía Firebase Cloud Messaging — puerto de
// scripts/lib/pushChannel.mjs (ver NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md
// Fase 1: el trigger de Firestore en triggers/onNotificationQueued.ts
// reemplaza el cron de GitHub Actions que antes usaba la versión .mjs).
// Mismo contrato de retorno que lib/emailChannel.ts.
import { getMessaging } from 'firebase-admin/messaging'

export interface SendPushInput {
  tokens: string[]
  title: string
  body: string
  data?: Record<string, string>
}

export interface SendPushResult {
  ok: boolean
  error?: string
  invalidTokens: string[]
}

// `tokens` puede tener más de uno (un organizador con push activo en
// celular Y notebook). sendEachForMulticast devuelve éxito/fallo por
// token — se junta acá en un solo resultado con `invalidTokens` para que
// el caller pueda podar users/{uid}.fcmTokens (arrayRemove) sin tener que
// reimplementar esa lógica en cada consumidor de este channel.
export async function sendPush({ tokens, title, body, data }: SendPushInput): Promise<SendPushResult> {
  if (!tokens || tokens.length === 0) {
    return { ok: true, invalidTokens: [] } // no-op silencioso: 0 tokens no es un error, ver triggers/onNotificationQueued.ts
  }
  try {
    const response = await getMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: data || {},
    })
    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
      // Códigos documentados de Firebase Admin como "este token ya no sirve,
      // no reintentar" — no se trata como error del envío en sí.
      const code = r.error?.code
      if (!r.success && (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token')) {
        invalidTokens.push(tokens[i])
      }
    })
    return { ok: response.successCount > 0 || tokens.length === invalidTokens.length, invalidTokens }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), invalidTokens: [] }
  }
}
