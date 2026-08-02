// Puerto de scripts/lib/renderPlainTextEmailHtml.mjs (ver
// NOTIFICATIONS_CONSOLIDATION_ARCHITECTURE.md Fase 3) — vuelve a renderizar
// HTML desde el `bodyText` plano guardado en el documento de campaña, en
// vez de confiar en HTML generado en el navegador (MassMessageComposer.tsx
// solo lo usa para vista previa).
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
