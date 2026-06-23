import emailjs from '@emailjs/browser'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_WELCOME
const REMINDER_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_REMINDER
const CHECKIN_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_CHECKIN
const PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY

/**
 * Envía el correo de bienvenida vía EmailJS. Si las credenciales no están configuradas
 * (por ejemplo en desarrollo local), no hace nada en lugar de romper el registro.
 */
export async function sendWelcomeEmail(toEmail: string, toName: string) {
  if (!SERVICE_ID || !WELCOME_TEMPLATE_ID || !PUBLIC_KEY) return
  try {
    await emailjs.send(
      SERVICE_ID,
      WELCOME_TEMPLATE_ID,
      { to_email: toEmail, to_name: toName || 'usuario' },
      { publicKey: PUBLIC_KEY },
    )
  } catch (err) {
    console.error('Error sending welcome email:', err)
  }
}

// Template vars: to_email, to_name, event_name, event_date, event_location, pass_url
export async function sendReminderEmail(
  toEmail: string,
  toName: string,
  eventName: string,
  eventDate: string,
  eventLocation: string,
  passUrl: string,
) {
  if (!SERVICE_ID || !REMINDER_TEMPLATE_ID || !PUBLIC_KEY) return
  try {
    await emailjs.send(
      SERVICE_ID,
      REMINDER_TEMPLATE_ID,
      { to_email: toEmail, to_name: toName, event_name: eventName, event_date: eventDate, event_location: eventLocation, pass_url: passUrl },
      { publicKey: PUBLIC_KEY },
    )
  } catch (err) {
    console.error('Error sending reminder email:', err)
  }
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
