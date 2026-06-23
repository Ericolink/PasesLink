import emailjs from '@emailjs/browser'
import { emitEmailNotification } from './emailNotifications'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_WELCOME
const CHECKIN_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_CHECKIN
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

const RETRY_DELAYS_MS = [1000, 2000, 4000]

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Reintenta `send` con backoff exponencial (1s, 2s, 4s). En el primer fallo
 * avisa a la UI vía emailNotifications — antes de saber si los reintentos
 * funcionarán — para que el usuario sepa que se está reintentando en vez de
 * asumir silenciosamente que el email se perdió.
 */
async function sendWithRetry(send: () => Promise<unknown>, onFirstFailureMessage: string, logLabel: string) {
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      await send()
      return
    } catch (err) {
      console.error(`${logLabel} (intento ${attempt + 1}/${RETRY_DELAYS_MS.length + 1}):`, err)
      if (attempt === 0) emitEmailNotification(onFirstFailureMessage)
      if (attempt < RETRY_DELAYS_MS.length) await wait(RETRY_DELAYS_MS[attempt])
    }
  }
}

/**
 * Envía el correo de bienvenida vía EmailJS. Si las credenciales no están configuradas
 * (por ejemplo en desarrollo local), no hace nada en lugar de romper el registro.
 */
export async function sendWelcomeEmail(toEmail: string, toName: string) {
  if (!SERVICE_ID || !WELCOME_TEMPLATE_ID || !PUBLIC_KEY) return
  await sendWithRetry(
    () => emailjs.send(
      SERVICE_ID,
      WELCOME_TEMPLATE_ID,
      { to_email: toEmail, to_name: toName || 'usuario' },
      { publicKey: PUBLIC_KEY },
    ),
    'No se envió el email de bienvenida. Intentaremos de nuevo.',
    'Error sending welcome email',
  )
}

// Template vars: to_email, event_name, checkins_list (HTML, .checkin-item por invitado), summary_count, current_year
export async function sendCheckinSummaryEmail(
  toEmail: string,
  eventName: string,
  checkinsListHtml: string,
  summaryCount: number,
) {
  if (!SERVICE_ID || !CHECKIN_TEMPLATE_ID || !PUBLIC_KEY) return
  // Última barrera antes de llamar a EmailJS: si to_email llega vacío acá
  // (sin trim), EmailJS responde 422 "The recipients address is empty" en
  // vez de fallar en nuestro código — lo cortamos antes y lo logueamos con
  // contexto, en vez de dejar que la API externa sea la primera en notarlo.
  const recipient = toEmail?.trim()
  if (!recipient) {
    console.error('sendCheckinSummaryEmail: to_email vacío, no se llama a EmailJS.', { eventName })
    return
  }
  try {
    await emailjs.send(
      SERVICE_ID,
      CHECKIN_TEMPLATE_ID,
      {
        to_email: recipient,
        event_name: eventName,
        checkins_list: checkinsListHtml,
        summary_count: String(summaryCount),
        // Dinámico a propósito — el footer del template HTML en EmailJS debe
        // usar {{current_year}} en vez del año hardcodeado (cambio a hacer
        // en el dashboard de EmailJS, no en este código).
        current_year: new Date().getFullYear().toString(),
      },
      { publicKey: PUBLIC_KEY },
    )
  } catch (err) {
    console.error('Error sending checkin summary email:', err)
  }
}
