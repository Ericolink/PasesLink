// Envío de email server-side vía la API REST de Brevo — mismo contrato que
// scripts/lib/emailChannel.mjs (portado, no reinventado; ver ese archivo
// para el porqué de Brevo en vez de EmailJS). Las credenciales llegan acá
// como env vars igual que en el script — con secrets declarados vía
// `secrets: [brevoApiKey, brevoSenderEmail]` en la función que llama a
// esto, Cloud Functions v2 las resuelve automáticamente en
// `process.env` (ver lib/secrets.ts), sin cambiar esta función.
//
// Clasificación de errores (errorKind): Cloud Functions v2 (Cloud Run) no
// tiene una IP de salida fija por defecto — cada instancia egresa por una
// IP compartida y dinámica del pool de Google Cloud (IPv4 o IPv6), que
// cambia con el tiempo. Brevo con "Authorized IPs" activo rechaza con 401
// cualquier IP que no reconozca (mensaje "unrecognised IP address ..."),
// algo estructural en esta infraestructura y no un bug puntual — por eso
// 'unauthorized_ip' se distingue de 'invalid_api_key' (401 por key
// inválida/revocada, mensaje distinto) en vez de tratar todo 401 igual.
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'
const REQUEST_TIMEOUT_MS = 10_000

export interface SendEmailInput {
  toEmail: string
  toName?: string
  subject: string
  html: string
}

export type BrevoErrorKind =
  | 'missing_credentials'
  | 'unauthorized_ip'
  | 'invalid_api_key'
  | 'invalid_request'
  | 'rate_limited'
  | 'server_error'
  | 'timeout'
  | 'network_error'
  | 'unknown'

export interface SendEmailResult {
  ok: boolean
  error?: string
  errorKind?: BrevoErrorKind
}

// Mensajes pensados para mostrarse tal cual en el panel de admin (ver
// src/hooks/useAdminAlerts.ts, que vuelca `errorMessage` directo a la UI) —
// nunca incluyen la API key ni el cuerpo crudo de Brevo, solo lo necesario
// para que el admin sepa qué revisar.
function classifyBrevoError(status: number, rawBody: string): { kind: BrevoErrorKind; message: string } {
  let providerMessage = rawBody
  try {
    const parsed = JSON.parse(rawBody) as { message?: string }
    if (parsed.message) providerMessage = parsed.message
  } catch {
    // Cuerpo no era JSON (p.ej. error de un proxy intermedio) — se usa tal cual.
  }

  if (status === 401) {
    if (/unrecognised IP address/i.test(providerMessage)) {
      const ipMatch = providerMessage.match(/IP address\s+([0-9a-fA-F:.]+)/i)
      const ip = ipMatch ? ipMatch[1].replace(/\.$/, '') : 'desconocida'
      return {
        kind: 'unauthorized_ip',
        message:
          `Brevo rechazó el envío porque la IP de salida del servidor no está autorizada. ` +
          `IP detectada: ${ip}. Revisa las IPs autorizadas en la configuración de seguridad de Brevo ` +
          `(https://app.brevo.com/security/authorised_ips).`,
      }
    }
    return {
      kind: 'invalid_api_key',
      message: 'Brevo rechazó la API key configurada. Verifica que BREVO_API_KEY sea válida y esté vigente.',
    }
  }
  if (status === 400) {
    return { kind: 'invalid_request', message: `Brevo rechazó la solicitud por datos inválidos: ${providerMessage}` }
  }
  if (status === 429) {
    return { kind: 'rate_limited', message: 'Brevo aplicó un límite de envíos (rate limit). Se reintentará más tarde.' }
  }
  if (status >= 500) {
    return { kind: 'server_error', message: `Brevo tuvo un error interno (HTTP ${status}). Se reintentará más tarde.` }
  }
  return { kind: 'unknown', message: `Brevo ${status}: ${providerMessage}` }
}

export async function sendEmail({ toEmail, toName, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  if (!apiKey || !senderEmail) {
    return { ok: false, error: 'Falta BREVO_API_KEY o BREVO_SENDER_EMAIL', errorKind: 'missing_credentials' }
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(BREVO_ENDPOINT, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: 'PaseLink' },
        to: [{ email: toEmail, name: toName }],
        subject,
        htmlContent: html,
      }),
      signal: controller.signal,
    })
    if (!response.ok) {
      const body = await response.text()
      const { kind, message } = classifyBrevoError(response.status, body)
      return { ok: false, error: message, errorKind: kind }
    }
    return { ok: true }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      return { ok: false, error: 'Brevo no respondió a tiempo (timeout).', errorKind: 'timeout' }
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err), errorKind: 'network_error' }
  } finally {
    clearTimeout(timeoutId)
  }
}
