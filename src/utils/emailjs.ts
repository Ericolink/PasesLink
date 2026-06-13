import emailjs from '@emailjs/browser'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_WELCOME
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
      {
        to_email: toEmail,
        to_name: toName || 'usuario',
      },
      { publicKey: PUBLIC_KEY },
    )
  } catch (err) {
    console.error('Error sending welcome email:', err)
  }
}
