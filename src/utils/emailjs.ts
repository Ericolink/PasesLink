import emailjs from '@emailjs/browser'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_WELCOME
const REMINDER_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_REMINDER
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
