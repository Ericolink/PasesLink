// Middlewares de observabilidad para los tres tipos de entrada del backend
// (Callable, Scheduled, Trigger de Firestore). Combinan logging
// estructurado + clasificación/registro de errores + cronómetro de
// duración en un solo punto, para no repetir ese bloque en cada una de las
// 24 funciones exportadas.
//
// Patrón de uso — se LLAMAN dentro de un arrow function ya tipado por el
// propio `onCall`/`onSchedule`/`onDocumentUpdated` (en vez de envolver el
// handler completo), así el tipo de `request`/`event` se sigue infiriendo
// exactamente como antes, sin anotaciones manuales adicionales:
//
//   onCall<Input>((request) => withCallableObservability(request, 'nombre', async (ctx) => { ... }))
//   onSchedule(opts, () => withScheduledObservability('nombre', async (ctx) => { ... }))
//   onDocumentUpdated(opts, (event) => withTriggerObservability(event, 'nombre', async (ctx) => { ... }))
import type { CallableRequest } from 'firebase-functions/v2/https'
import type { BaseContextFields, RequestContext } from './context.js'
import { createRequestContext } from './context.js'
import type { Logger } from './logger.js'
import { createLogger } from './logger.js'
import { isExpectedError, toSafeHttpsError } from './errors.js'
import { SLOW_OPERATION_THRESHOLD_MS } from './performanceTimer.js'

export interface ObservabilityContext {
  logger: Logger
  /** Agrega campos (uid/eventId/guestId/etc.) que se reflejan en todos los logs restantes de esta invocación, incluido el de cierre. */
  addContext(fields: BaseContextFields): void
}

function buildObservabilityContext(ctx: RequestContext, logger: Logger): ObservabilityContext {
  return { logger, addContext: (fields) => ctx.addContext(fields) }
}

function logStart(logger: Logger, functionName: string): void {
  logger.info(`Inicio: ${functionName}`)
}

function logSuccess(ctx: RequestContext, logger: Logger, functionName: string, extra: Record<string, unknown> = {}): void {
  const durationMs = ctx.elapsedMs()
  logger.info(`Éxito: ${functionName}`, { durationMs, ...extra })
  if (durationMs > SLOW_OPERATION_THRESHOLD_MS) {
    logger.warn(`Operación lenta: ${functionName} tardó ${durationMs}ms`, { durationMs, slowOperation: true })
  }
}

function logFailure(ctx: RequestContext, logger: Logger, functionName: string, err: unknown): void {
  const durationMs = ctx.elapsedMs()
  if (isExpectedError(err)) {
    logger.warn(`Error esperado en ${functionName}: ${err.message}`, { durationMs, code: err.code })
  } else {
    logger.error(`Error inesperado en ${functionName}`, {
      durationMs,
      error: err instanceof Error ? err : new Error(String(err)),
    })
  }
}

function approxJsonSize(value: unknown): number | undefined {
  try {
    return JSON.stringify(value)?.length
  } catch {
    return undefined
  }
}

/** Callable Functions (onCall) — clasifica errores y siempre re-lanza un HttpsError seguro para el cliente. */
export async function withCallableObservability<Return>(
  request: CallableRequest<unknown>,
  functionName: string,
  handler: (ctx: ObservabilityContext) => Return | Promise<Return>,
): Promise<Return> {
  const ctx = createRequestContext(functionName, request.auth?.uid ? { uid: request.auth.uid } : {})
  const logger = createLogger(ctx)
  logStart(logger, functionName)
  try {
    const result = await handler(buildObservabilityContext(ctx, logger))
    logSuccess(ctx, logger, functionName, { responseSizeBytes: approxJsonSize(result) })
    return result
  } catch (err) {
    logFailure(ctx, logger, functionName, err)
    throw toSafeHttpsError(err)
  }
}

/** Funciones programadas (onSchedule) — sin cliente esperando respuesta; el error original se re-lanza tal cual para que Cloud Scheduler registre el fallo. */
export async function withScheduledObservability(
  functionName: string,
  handler: (ctx: ObservabilityContext) => void | Promise<void>,
): Promise<void> {
  const ctx = createRequestContext(functionName)
  const logger = createLogger(ctx)
  logStart(logger, functionName)
  try {
    await handler(buildObservabilityContext(ctx, logger))
    logSuccess(ctx, logger, functionName)
  } catch (err) {
    logFailure(ctx, logger, functionName, err)
    throw err
  }
}

/** Triggers de Firestore (onDocumentCreated/Updated/Written/Deleted) — agrega automáticamente los params del path (p. ej. eventId) al contexto. */
export async function withTriggerObservability<Event extends { params: Record<string, string> }>(
  event: Event,
  functionName: string,
  handler: (ctx: ObservabilityContext) => void | Promise<void>,
): Promise<void> {
  const ctx = createRequestContext(functionName, { ...event.params })
  const logger = createLogger(ctx)
  logStart(logger, functionName)
  try {
    await handler(buildObservabilityContext(ctx, logger))
    logSuccess(ctx, logger, functionName)
  } catch (err) {
    logFailure(ctx, logger, functionName, err)
    throw err
  }
}
