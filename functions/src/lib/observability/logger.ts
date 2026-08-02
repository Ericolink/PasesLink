// Logging estructurado recomendado por Google para Cloud Functions v2:
// `firebase-functions/logger` escribe JSON a stdout/stderr, que Cloud
// Logging parsea automáticamente en `jsonPayload` (a diferencia de
// `console.log`, que queda como texto plano y no es filtrable por campo).
// Cero dependencias nuevas — el logger ya viene incluido en
// `firebase-functions`, solo estaba sin usar.
import { logger as functionsLogger } from 'firebase-functions/logger'
import type { RequestContext } from './context.js'

export type LogFields = Record<string, unknown>
export type LogSeverity = 'DEBUG' | 'INFO' | 'WARNING' | 'ERROR'

export interface Logger {
  debug(message: string, fields?: LogFields): void
  info(message: string, fields?: LogFields): void
  warn(message: string, fields?: LogFields): void
  error(message: string, fields?: LogFields): void
}

// Cloud Error Reporting agrupa por stack trace, y `JSON.stringify(new Error())`
// da `{}` — sin esto, cualquier Error que viaje en los campos se perdería
// en el jsonPayload.
function normalizeFields(fields: LogFields): LogFields {
  const normalized: LogFields = {}
  for (const [key, value] of Object.entries(fields)) {
    normalized[key] = value instanceof Error
      ? { name: value.name, message: value.message, stack: value.stack }
      : value
  }
  return normalized
}

function write(ctx: RequestContext, severity: LogSeverity, message: string, fields: LogFields = {}): void {
  functionsLogger.write({
    severity,
    message,
    timestamp: new Date().toISOString(),
    requestId: ctx.requestId,
    functionName: ctx.functionName,
    ...normalizeFields(ctx.fields),
    ...normalizeFields(fields),
  })
}

/** Logger ligado a un RequestContext — cada llamada incluye automáticamente requestId/functionName/uid/eventId/guestId ya acumulados en el contexto. */
export function createLogger(ctx: RequestContext): Logger {
  return {
    debug: (message, fields) => write(ctx, 'DEBUG', message, fields),
    info: (message, fields) => write(ctx, 'INFO', message, fields),
    warn: (message, fields) => write(ctx, 'WARNING', message, fields),
    error: (message, fields) => write(ctx, 'ERROR', message, fields),
  }
}
