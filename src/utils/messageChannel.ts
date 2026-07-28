export interface MessageChannel {
  id: 'email'
  label: string
}

// Único canal activo hoy. Punto de extensión documentado: un futuro canal
// 'whatsapp' | 'push' | 'sms' agrega un entry acá (para el selector de canal
// del composer) y un nuevo scripts/lib/<canal>Channel.mjs (para el envío
// real) — ninguno de los dos requiere Cloud Functions (no existen en este
// proyecto, ver scripts/send-rsvp-reminders.mjs).
export const EMAIL_CHANNEL: MessageChannel = { id: 'email', label: 'Email' }

// Vista previa en el composer únicamente — el script Node vuelve a renderizar
// desde el mismo bodyText plano en vez de confiar en HTML generado en el
// cliente (scripts/send-mass-messages.mjs / send-rsvp-reminders.mjs).
export function renderPlainTextEmailHtml(bodyText: string): string {
  const escaped = bodyText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  const paragraphs = escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('')
  return `<div style="font-family: sans-serif; font-size: 14px; color: #111;">${paragraphs}</div>`
}
