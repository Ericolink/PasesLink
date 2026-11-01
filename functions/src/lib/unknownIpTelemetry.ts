// Visibilidad agregada de las búsquedas de pases con IP de cliente no
// determinada (T1.3) — un `warn` por solicitud inundaría los logs justo en
// el caso en que más importa (una configuración de proxies inesperada haría
// que TODAS las solicitudes caigan acá). En su lugar, cada instancia acumula
// un conteo y emite como máximo un `warn` por minuto, con la cantidad y las
// formas de X-Forwarded-For vistas (clases, nunca direcciones).
//
// El conteo exacto no depende de esto: el log de cierre de cada invocación
// ya trae `ipSource: "unknown"`, y la métrica basada en logs de
// docs/rate-limiting.md cuenta esas entradas. Este resumen es la señal
// legible para quien mira los logs, y el gancho para la alerta.
import type { Logger } from './observability/logger.js'

const FLUSH_INTERVAL_MS = 60_000
const MAX_DISTINCT_SHAPES = 10

export class UnknownIpTelemetry {
  private windowStart: number | null = null
  private count = 0
  private shapes = new Map<string, number>()

  /** Registra una solicitud con IP desconocida; si terminó el minuto anterior, emite su resumen. */
  record(logger: Logger | undefined, now: number, forwardedShape: string): void {
    if (this.windowStart !== null && now - this.windowStart >= FLUSH_INTERVAL_MS) this.flush(logger)
    if (this.windowStart === null) this.windowStart = now
    this.count++
    // Tope de claves: las formas son clases ("public,infra"), pero un header
    // largo y variable no debería crecer el mapa sin límite.
    const key = this.shapes.has(forwardedShape) || this.shapes.size < MAX_DISTINCT_SHAPES ? forwardedShape : 'other'
    this.shapes.set(key, (this.shapes.get(key) ?? 0) + 1)
  }

  private flush(logger: Logger | undefined): void {
    logger?.warn(`IP del cliente no determinada en ${this.count} búsquedas de pases (último minuto, esta instancia)`, {
      unknownIpCount: this.count,
      forwardedShapes: Object.fromEntries(this.shapes),
    })
    this.windowStart = null
    this.count = 0
    this.shapes = new Map()
  }
}
