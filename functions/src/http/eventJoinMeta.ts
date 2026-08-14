// Sirve el HTML de /e/:id (enlace corto de auto-registro, ver
// ShareEventButton.tsx) con metadata de Open Graph/Twitter Card
// personalizada al evento y a quién generó el link — reemplaza la preview
// genérica "PaseLink - Gestión de invitados para eventos" que veía
// WhatsApp/Facebook/Discord/etc. hasta ahora. Enrutado acá vía el rewrite
// de Hosting "/e/**" en firebase.json (debe ir ANTES del catch-all "**").
//
// Sin distinción por user-agent a propósito: /e/:id es un punto de entrada
// de un solo click (después la SPA toma el control del lado del cliente),
// así que servir HTML dinámico para TODA request a esta ruta es más simple
// y más robusto que mantener una lista de user-agents de crawlers (que
// cambian, y WhatsApp en particular no siempre es distinguible) — no
// penaliza tráfico general, solo el momento exacto en que la
// personalización tiene sentido.
//
// La lógica de negocio (parseo, orquestación) es pura y testeable sin HTTP
// real (mismo criterio que whatsappWebhook.ts) — el handler es un wrapper
// delgado.
import { onRequest } from 'firebase-functions/v2/https'
import { getApp } from 'firebase-admin/app'
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore'
import { logger } from 'firebase-functions/logger'
import { buildSelfRegistrationMetadata } from '../linkMeta/buildSelfRegistrationMetadata.js'
import { injectMetaTags, injectNoIndex } from '../linkMeta/injectMetaTags.js'
import { resolveLinkCreator } from '../linkMeta/resolveLinkCreator.js'

export function parseEventIdFromPath(path: string): string | null {
  const match = path.match(/^\/e\/([^/?]+)\/?$/)
  return match ? decodeURIComponent(match[1]) : null
}

export interface RenderEventJoinHtmlParams {
  db: Firestore
  // Inyectable: en producción resuelve al self-fetch cacheado de la raíz de
  // Hosting (ver fetchBaseHtmlFromHosting más abajo); en tests, un stub sin
  // red ni emulador de Hosting.
  fetchBaseHtml: () => Promise<string>
  eventId: string
  refUid: string | null
  baseUrl: string
}

// Orquesta: evento -> ¿aplica personalización? -> invitador -> metadata ->
// inyección. Ante evento inexistente o entryMode 'list' (auto-registro
// deshabilitado, ver EventJoin.tsx) devuelve el HTML base tal cual — nunca
// deja una preview rota, y la página real sigue funcionando igual (esta
// función solo toca el <head>, nunca el comportamiento de EventJoin).
export async function renderEventJoinHtml({
  db,
  fetchBaseHtml,
  eventId,
  refUid,
  baseUrl,
}: RenderEventJoinHtmlParams): Promise<string> {
  const [fetchedHtml, eventSnap] = await Promise.all([fetchBaseHtml(), db.collection('events').doc(eventId).get()])
  // /e/:id es siempre un evento privado puntual — nunca debe indexarse, con
  // o sin personalización aplicada (ver injectNoIndex).
  const baseHtml = injectNoIndex(fetchedHtml)

  if (!eventSnap.exists) return baseHtml
  const event = eventSnap.data() as DocumentData
  if (event.entryMode === 'list') return baseHtml

  const creator = await resolveLinkCreator(db, event, refUid)
  const meta = buildSelfRegistrationMetadata(
    { name: event.name as string, coverImage: event.coverImage as string | undefined },
    creator.displayName,
    `${baseUrl}/icons/pwa-512.png`,
  )
  const canonicalUrl = `${baseUrl}/e/${eventId}`
  return injectMetaTags(baseHtml, meta, canonicalUrl)
}

// Vite hashea los nombres de archivo de cada build (dist/assets/*.js), así
// que esta función no puede hardcodear el <script>/<link> del HTML
// compilado — en cambio, se auto-consulta la raíz del propio Hosting ("/"
// no matchea el rewrite "/e/**", solo el catch-all "**", así que sirve el
// index.html real de la build actual) y cachea el resultado en memoria
// (5 min) para no pagar ese fetch en cada click de un enlace compartido.
const BASE_HTML_CACHE_TTL_MS = 5 * 60 * 1000
let cachedBaseHtml: { html: string; fetchedAt: number } | null = null

async function fetchBaseHtmlFromHosting(baseUrl: string): Promise<string> {
  if (cachedBaseHtml && Date.now() - cachedBaseHtml.fetchedAt < BASE_HTML_CACHE_TTL_MS) {
    return cachedBaseHtml.html
  }
  const response = await fetch(`${baseUrl}/`)
  if (!response.ok) {
    // Un HTML viejo en caché sigue siendo mejor que ninguno — la
    // personalización se resigna, pero el invitado no ve un error.
    if (cachedBaseHtml) return cachedBaseHtml.html
    throw new Error(`No se pudo obtener el HTML base de Hosting (status ${response.status}).`)
  }
  const html = await response.text()
  cachedBaseHtml = { html, fetchedAt: Date.now() }
  return html
}

// *.web.app: usado SIEMPRE para el self-fetch del HTML base (fiable, propio
// de Firebase, sin depender de que Cloudflare/DNS del dominio público estén
// arriba para una llamada servidor-a-servidor interna).
function resolveInternalBaseUrl(projectId: string): string {
  return `https://${projectId}.web.app`
}

// paselink.com: dominio público real (ver src/hooks/useSeoMeta.ts, mismo
// criterio) — Cloudflare lo proxea hacia este mismo sitio de Hosting, pero
// no está conectado como dominio custom dentro de Firebase (.firebaserc sin
// targets), así que no hay forma de derivarlo de projectId. Solo producción
// tiene dominio propio; cualquier otro proyecto (staging) sigue anunciando
// su propio *.web.app en canonical/OG — nunca debe publicitar el dominio de
// producción.
export function resolvePublicBaseUrl(projectId: string): string {
  return projectId === 'app-pases-9e6e7' ? 'https://www.paselink.com' : resolveInternalBaseUrl(projectId)
}

// Igual configuración implícita que whatsappWebhook.ts (único onRequest
// existente hasta ahora): sin overrides de memoria/timeout (hereda los
// defaults globales de functions/src/index.ts, de sobra para una lectura de
// Firestore + un self-fetch cacheado), cors: false (solo lo pega el
// rewrite de Hosting o la navegación directa de un navegador/crawler, nunca
// un fetch() desde el propio origen de PaseLink). Tampoco usa
// withObservability.ts (ese helper es para Callables) — mismo nivel de
// instrumentación que whatsappWebhook.ts, logger plano en los puntos clave.
export const eventJoinMeta = onRequest({ cors: false }, async (req, res) => {
  const eventId = parseEventIdFromPath(req.path)
  const projectId = getApp().options.projectId as string
  const internalBaseUrl = resolveInternalBaseUrl(projectId)
  const publicBaseUrl = resolvePublicBaseUrl(projectId)

  if (!eventId) {
    res.redirect(302, '/')
    return
  }

  const refUid = typeof req.query.ref === 'string' ? req.query.ref : null

  try {
    const html = await renderEventJoinHtml({
      db: getFirestore(),
      fetchBaseHtml: () => fetchBaseHtmlFromHosting(internalBaseUrl),
      eventId,
      refUid,
      baseUrl: publicBaseUrl,
    })
    logger.info('eventJoinMeta: preview servida', { eventId, hasRef: !!refUid })
    res.set('Content-Type', 'text/html; charset=utf-8')
    // WhatsApp/Facebook/Discord/etc. cachean la metadata *scrapeada* del
    // lado de ellos por horas o días una vez que un link se comparte en un
    // chat, sin importar este header — un cambio de nombre/portada del
    // evento después de ese primer scrape no se refleja retroactivamente
    // en esa conversación. No hay nada del lado de PaseLink que lo
    // resuelva; este Cache-Control solo evita pegarle a Firestore en cada
    // click dentro de una misma ventana de 5 minutos.
    res.set('Cache-Control', 'public, max-age=300, s-maxage=300')
    res.status(200).send(html)
  } catch (err) {
    // Nunca un 500 a un click real de invitación: si algo de la
    // personalización falla (self-fetch caído, Firestore momentáneamente
    // inaccesible), se manda al invitado directo al formulario de
    // registro en vez de mostrarle un error.
    logger.error('eventJoinMeta: fallo al armar la preview, degradando a /events/:id/join', {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    })
    res.redirect(302, `/events/${eventId}/join`)
  }
})
