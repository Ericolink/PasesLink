// Contexto estructurado que viaja por todo el ciclo de vida de una
// invocación (Callable, Scheduled o Trigger) — es lo que permite que todos
// los logs de una misma ejecución compartan requestId/functionName/uid/
// eventId/guestId y se puedan filtrar juntos en Cloud Logging.
import { randomUUID } from 'node:crypto'

export interface BaseContextFields {
  uid?: string
  eventId?: string
  guestId?: string
  [key: string]: unknown
}

export interface RequestContext {
  readonly requestId: string
  readonly functionName: string
  readonly startedAt: number
  fields: BaseContextFields
  /** Agrega o sobreescribe campos de contexto — se reflejan en todos los logs posteriores, incluido el de cierre. */
  addContext(fields: BaseContextFields): void
  elapsedMs(): number
}

export function createRequestContext(functionName: string, initialFields: BaseContextFields = {}): RequestContext {
  const requestId = randomUUID()
  const startedAt = Date.now()
  const fields: BaseContextFields = { ...initialFields }
  return {
    requestId,
    functionName,
    startedAt,
    fields,
    addContext(next) {
      Object.assign(fields, next)
    },
    elapsedMs() {
      return Date.now() - startedAt
    },
  }
}
