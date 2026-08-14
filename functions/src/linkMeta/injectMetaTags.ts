// Reemplazo dirigido de los 8 meta tags relevantes dentro del index.html ya
// compilado (ver eventJoinMeta.ts) — nunca reconstruye el documento, así que
// cualquier otra cosa en el <head> (CSP vía meta si existiera, JSON-LD,
// preloads, fuentes) queda intacta. Único punto de escape HTML de todo el
// pipeline: los textos que llegan acá (nombre de evento, nombre del
// invitador) son datos de usuario sin sanear — nunca insertarlos crudos.
import type { LinkMetadata } from './types.js'

export function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function replaceTitle(html: string, title: string): string {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${title}</title>`)
}

// `attrName` es siempre 'property' (Open Graph) o 'name' (Twitter Card) —
// mismo formato que index.html: `<meta property="og:title" content="..." />`.
function replaceMetaContent(html: string, attrName: 'property' | 'name', key: string, value: string): string {
  const pattern = new RegExp(`(<meta\\s+${attrName}="${key}"\\s+content=")[^"]*("\\s*/?>)`, 'i')
  return html.replace(pattern, `$1${value}$2`)
}

// /e/:id representa un evento privado puntual (nombre, fecha, portada,
// invitador) — nunca debe indexarse en buscadores, sin importar si aplica
// personalización o no (ver eventJoinMeta.ts, que llama esto sobre TODA
// respuesta de esta ruta). No afecta el scraping de WhatsApp/Facebook/etc.
// para las previews: esos bots ignoran <meta name="robots"> y solo leen
// los og:*/twitter:* de abajo.
export function injectNoIndex(html: string): string {
  return replaceMetaContent(html, 'name', 'robots', 'noindex, nofollow')
}

export function injectMetaTags(baseHtml: string, meta: LinkMetadata, canonicalUrl: string): string {
  const title = escapeHtmlAttr(meta.title)
  const ogTitle = escapeHtmlAttr(meta.ogTitle)
  const ogDescription = escapeHtmlAttr(meta.ogDescription)
  const ogImage = escapeHtmlAttr(meta.ogImage)
  const ogUrl = escapeHtmlAttr(canonicalUrl)
  const twitterTitle = escapeHtmlAttr(meta.twitterTitle)
  const twitterDescription = escapeHtmlAttr(meta.twitterDescription)
  const twitterImage = escapeHtmlAttr(meta.twitterImage)

  let html = baseHtml
  html = replaceTitle(html, title)
  html = replaceMetaContent(html, 'property', 'og:title', ogTitle)
  html = replaceMetaContent(html, 'property', 'og:description', ogDescription)
  html = replaceMetaContent(html, 'property', 'og:image', ogImage)
  html = replaceMetaContent(html, 'property', 'og:url', ogUrl)
  html = replaceMetaContent(html, 'name', 'twitter:title', twitterTitle)
  html = replaceMetaContent(html, 'name', 'twitter:description', twitterDescription)
  html = replaceMetaContent(html, 'name', 'twitter:image', twitterImage)
  return html
}
