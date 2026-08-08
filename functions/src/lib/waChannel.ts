// Envío de plantillas de WhatsApp vía la Cloud API de Meta (WhatsApp
// Business Platform) — mismo espíritu que lib/emailChannel.ts: función
// pura, credenciales por `process.env` (resueltas por Cloud Functions v2 a
// partir de los secrets declarados en lib/secrets.ts), mismo contrato de
// retorno `{ok, error?}` con un `errorCode` adicional para que el caller
// pueda decidir si vale la pena caer a email sin tener que parsear texto.
//
// Solo envía plantillas pre-aprobadas (ver lib/whatsappTemplates.ts) — la
// API de Meta exige eso para cualquier mensaje que la plataforma inicia
// (no es respuesta a algo que el invitado escribió), así que esta función
// nunca acepta texto libre.
import { isValidWhatsAppPhone, toWhatsAppPhone } from './phone.js'
import { WHATSAPP_TEMPLATES, type WhatsAppTemplateKind } from './whatsappTemplates.js'
import type { CountryCode } from 'libphonenumber-js/min'

const GRAPH_API_VERSION = 'v21.0'

export type WhatsAppErrorCode =
  | 'not_configured'
  | 'invalid_phone'
  | 'unreachable_phone'
  | 'template_not_found'
  | 'template_rejected'
  | 'token_expired'
  | 'rate_limited'
  | 'http_error'
  | 'unknown'

export interface SendWhatsAppInput {
  toPhone: string
  toPhoneCountry?: string
  templateKind: WhatsAppTemplateKind
  vars: Record<string, string>
}

export interface SendWhatsAppResult {
  ok: boolean
  error?: string
  errorCode?: WhatsAppErrorCode
  providerMessageId?: string
}

// Presente en runtime solo si `whatsappAccessToken`/`whatsappPhoneNumberId`
// (lib/secrets.ts) están declarados en la Cloud Function que llama a esto —
// mismo patrón que sendEmail con BREVO_API_KEY. Se expone aparte para que
// los callers puedan decidir "ni intentar WhatsApp" sin gastar una llamada
// de red que sabemos que va a fallar (y sin loguear el intento fallido).
export function isWhatsAppConfigured(): boolean {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
}

// Subconjunto de códigos de error documentados por Meta que nos importa
// distinguir (ver https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes) —
// el resto cae en 'unknown'/'http_error', que ya alcanza para decidir "no
// reintentar, caer a email" (ver §9 del issue: nada de esto amerita retry
// infinito, un fallo de WhatsApp siempre tiene una salida de respaldo).
function classifyMetaError(status: number, code: number | undefined, subcode: number | undefined): WhatsAppErrorCode {
  if (code === 190) return 'token_expired'
  if (code === 80007 || code === 4 || status === 429) return 'rate_limited'
  if (code === 132001 || subcode === 132001) return 'template_not_found'
  if (code === 132000 || code === 132005 || code === 132012 || code === 132015) return 'template_rejected'
  if (code === 131026 || code === 131030) return 'unreachable_phone'
  if (code === 131008 || code === 100) return 'invalid_phone'
  return status >= 500 ? 'http_error' : 'unknown'
}

export async function sendWhatsAppTemplate({
  toPhone,
  toPhoneCountry,
  templateKind,
  vars,
}: SendWhatsAppInput): Promise<SendWhatsAppResult> {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  if (!accessToken || !phoneNumberId) {
    return { ok: false, error: 'Falta WHATSAPP_ACCESS_TOKEN o WHATSAPP_PHONE_NUMBER_ID', errorCode: 'not_configured' }
  }

  if (!isValidWhatsAppPhone(toPhone, toPhoneCountry as CountryCode | undefined)) {
    return { ok: false, error: 'Número de teléfono inválido', errorCode: 'invalid_phone' }
  }
  const e164 = toWhatsAppPhone(toPhone, toPhoneCountry as CountryCode | undefined)

  const template = WHATSAPP_TEMPLATES[templateKind]
  const bodyParams = template.buildBodyParams(vars)

  try {
    const response = await fetch(`https://graph.facebook.com/${GRAPH_API_VERSION}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: e164,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          components: [
            {
              type: 'body',
              parameters: bodyParams.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    })

    const body = (await response.json().catch(() => ({}))) as {
      messages?: { id: string }[]
      error?: { message?: string; code?: number; error_subcode?: number }
    }

    if (!response.ok) {
      const errorCode = classifyMetaError(response.status, body.error?.code, body.error?.error_subcode)
      // Nunca se loguea `e164`/`toPhone` completo (§18 del issue) — solo el
      // código de Meta, útil para debugging sin exponer el destinatario.
      return { ok: false, error: `Meta ${response.status}: código ${body.error?.code ?? 'desconocido'}`, errorCode }
    }

    return { ok: true, providerMessageId: body.messages?.[0]?.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), errorCode: 'http_error' }
  }
}
