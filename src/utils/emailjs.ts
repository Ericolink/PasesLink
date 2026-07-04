import emailjs from '@emailjs/browser'
import { emitEmailNotification } from './emailNotifications'

const SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID
const WELCOME_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_WELCOME
const CHECKIN_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_CHECKIN
const PASS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_PASS
const REPORT_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID_REPORT
const REPORT_ADMIN_EMAIL = import.meta.env.VITE_REPORT_ADMIN_EMAIL
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

/**
 * Envía el pase (link con el QR) al email que el invitado dejó al autoregistrarse
 * en /events/:id/join. Es opcional en el formulario — si no se completó, esta
 * función ni se llama. Si no hay plantilla configurada (VITE_EMAILJS_TEMPLATE_ID_PASS),
 * no hace nada en vez de romper el registro, igual que sendWelcomeEmail.
 * Sin esto, un invitado anónimo que pierde el link (borra el navegador, cambia
 * de celular) no tiene forma de recuperar su pase.
 */
export async function sendGuestPassEmail(toEmail: string, eventName: string, passUrl: string) {
  if (!SERVICE_ID || !PASS_TEMPLATE_ID || !PUBLIC_KEY) return
  await sendWithRetry(
    () => emailjs.send(
      SERVICE_ID,
      PASS_TEMPLATE_ID,
      { to_email: toEmail, event_name: eventName, pass_url: passUrl },
      { publicKey: PUBLIC_KEY },
    ),
    'No se envió el email con tu pase. Intentaremos de nuevo.',
    'Error sending guest pass email',
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

// Aviso inmediato al admin cuando se reporta contenido del muro (src/firebase/moderation.ts).
// Best-effort y silencioso a propósito, igual que el resto de los correos de
// este archivo: un fallo acá no debe impedir que el reporte quede guardado
// (ya está en Firestore antes de llamar a esta función) — el admin igual lo
// va a ver en /admin, este correo es solo para que se entere más rápido.
// Vars del template: event_name, reported_at, reported_user, reporter,
// content_type, reason, admin_url.
export async function sendReportNotificationEmail(input: {
  eventName: string
  reportedUser: string
  reporter: string
  contentTypeLabel: string
  reason: string
  reportId: string
}) {
  if (!SERVICE_ID || !REPORT_TEMPLATE_ID || !PUBLIC_KEY || !REPORT_ADMIN_EMAIL) return
  try {
    await emailjs.send(
      SERVICE_ID,
      REPORT_TEMPLATE_ID,
      {
        to_email: REPORT_ADMIN_EMAIL,
        event_name: input.eventName,
        reported_at: new Date().toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }),
        reported_user: input.reportedUser,
        reporter: input.reporter,
        content_type: input.contentTypeLabel,
        reason: input.reason,
        admin_url: `${window.location.origin}/admin?tab=reports&reportId=${input.reportId}`,
      },
      { publicKey: PUBLIC_KEY },
    )
  } catch (err) {
    console.error('Error sending report notification email:', err)
  }
}
