// Lee el estado de errores de Cloud Functions vía la API de Sentry (REST,
// sin SDK — un solo GET no justifica sumar @sentry/node al backend, que hoy
// no tiene ninguna integración de Sentry). Requiere un Auth Token con scope
// project:read/event:read (ver secrets.ts) — DISTINTO del SENTRY_AUTH_TOKEN
// de CI, que solo sirve para subir source maps.
export type SentryHealthStatus = 'ok' | 'warning' | 'error' | 'unknown'

export interface SentryHealthResult {
  status: SentryHealthStatus
  unresolvedCount: number
  hasMore: boolean
}

// Umbrales elegidos para distinguir "sin problemas" de "algo se rompió
// seguido" — 0 issues sin resolver en 24h es la línea base esperada de un
// backend sano; 10+ (o la página completa, `hasMore`) es la señal de que
// algo se está rompiendo de forma sostenida, no un error aislado.
const WARNING_THRESHOLD = 1
const ERROR_THRESHOLD = 10

export function classifySentryHealth(unresolvedCount: number, hasMore: boolean): SentryHealthStatus {
  if (hasMore || unresolvedCount >= ERROR_THRESHOLD) return 'error'
  if (unresolvedCount >= WARNING_THRESHOLD) return 'warning'
  return 'ok'
}

// `limit=25`: suficiente para distinguir las 3 bandas (0 / 1-9 / 10+) sin
// paginar — si hay más de 25, el header `Link` trae `rel="next"`, que ya de
// por sí alcanza para clasificar como 'error' sin necesitar el conteo exacto.
//
// `lastSeen:-24h` (NO `statsPeriod=24h`) es lo que de verdad filtra por
// ventana de tiempo acá — confirmado en producción (issue real: con
// `statsPeriod` el endpoint devolvía TODOS los issues sin resolver de toda
// la historia del proyecto, statsPeriod solo anota el gráfico de cada
// issue, no filtra la lista. `lastSeen:-24h` sí restringe a issues con
// actividad en las últimas 24h, que es lo que la UI de Sentry muestra por
// defecto en su vista de 24h).
export async function getSentryHealth(token: string, orgSlug: string, projectSlug: string): Promise<SentryHealthResult> {
  const url = `https://sentry.io/api/0/projects/${orgSlug}/${projectSlug}/issues/?query=${encodeURIComponent('is:unresolved lastSeen:-24h')}&limit=25`
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    throw new Error(`Sentry API respondió ${res.status}: ${await res.text().catch(() => '')}`)
  }
  const issues = (await res.json()) as unknown[]
  const linkHeader = res.headers.get('link') || ''
  const hasMore = /rel="next";\s*results="true"/.test(linkHeader)
  const unresolvedCount = issues.length

  return { status: classifySentryHealth(unresolvedCount, hasMore), unresolvedCount, hasMore }
}
