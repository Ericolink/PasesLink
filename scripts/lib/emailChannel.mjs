// Envío de email server-side vía la API REST de Brevo (https://api.brevo.com).
// Elegido en vez de EmailJS (usado por src/utils/emailjs.ts) porque EmailJS
// es client-only y su plan gratis tope a 2 templates (ya consumidos por
// WELCOME + PASS) — Brevo manda HTML crudo por llamada, sin techo de
// templates, y su plan gratis (300 emails/día) alcanza para recordatorios +
// mensajería masiva a esta escala. Usado por scripts/send-rsvp-reminders.mjs
// y scripts/send-mass-messages.mjs — nunca importado desde src/ (la key de
// Brevo es un secret de servidor, nunca debe llegar al bundle del navegador).
const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email'

export async function sendEmail({ toEmail, toName, subject, html }) {
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
