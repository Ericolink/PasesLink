// Envío de email server-side vía la API REST de Brevo — mismo contrato que
// scripts/lib/emailChannel.mjs (portado, no reinventado; ver ese archivo
// para el porqué de Brevo en vez de EmailJS). Las credenciales llegan acá
// como env vars igual que en el script — con secrets declarados vía
// `secrets: [brevoApiKey, brevoSenderEmail]` en la función que llama a
// esto, Cloud Functions v2 las resuelve automáticamente en
// `process.env` (ver lib/secrets.ts), sin cambiar esta función.
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export interface SendEmailInput {
  toEmail: string
  toName?: string
  subject: string
  html: string
}

export interface SendEmailResult {
  ok: boolean
  error?: string
}

export async function sendEmail({ toEmail, toName, subject, html }: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.BREVO_API_KEY
  const senderEmail = process.env.BREVO_SENDER_EMAIL
  if (!apiKey || !senderEmail) {
    return { ok: false, error: 'Falta BREVO_API_KEY o BREVO_SENDER_EMAIL' }
  }

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
    })
    if (!response.ok) {
      const body = await response.text()
      return { ok: false, error: `Brevo ${response.status}: ${body}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
