// Duplicado deliberado de src/utils/messageChannel.ts (misma función, mismo
// nombre) — los scripts/*.mjs nunca importan de src/ (convención ya
// establecida por scripts/backup-firestore.mjs y send-rsvp-reminders.mjs), y
// el script vuelve a renderizar desde bodyText plano en vez de confiar en
// HTML generado en el navegador (MassMessageComposer.tsx solo lo usa para
// vista previa).
export function renderPlainTextEmailHtml(bodyText) {
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
