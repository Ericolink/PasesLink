// Clasificación de errores para decidir nivel de log y si deben llegar a
// Cloud Error Reporting. No introduce una jerarquía de errores nueva: los
// 63 sitios existentes que hacen `throw new HttpsError(...)` siguen siendo
// la única forma de lanzar errores del backend — esto solo decide, en el
// borde (dentro de withObservability.ts), cómo tratar lo que ya se lanzó.
import { HttpsError, type FunctionsErrorCode } from 'firebase-functions/v2/https'

// Códigos que representan reglas de negocio ya pensadas para el usuario
// final (datos inválidos, permisos, recursos no encontrados, etc.) — se
// loguean en WARNING y nunca se reportan a Error Reporting: son ruido
// esperado, no bugs.
const EXPECTED_CODES: ReadonlySet<FunctionsErrorCode> = new Set([
  'invalid-argument',
  'not-found',
  'permission-denied',
  'unauthenticated',
  'failed-precondition',
  'already-exists',
  'resource-exhausted',
  'out-of-range',
])

export function isExpectedError(err: unknown): err is HttpsError {
  return err instanceof HttpsError && EXPECTED_CODES.has(err.code)
}

const GENERIC_INTERNAL_MESSAGE = 'Ocurrió un error inesperado. Intenta de nuevo en unos minutos.'

/**
 * Convierte cualquier error inesperado (no-HttpsError, o HttpsError con
 * código de infraestructura como `internal`/`unavailable`) en un
 * HttpsError('internal', ...) seguro para el cliente, sin filtrar detalles
 * internos. Los errores esperados se devuelven sin cambios.
 */
export function toSafeHttpsError(err: unknown): HttpsError {
  if (isExpectedError(err)) return err
  if (err instanceof HttpsError) {
    // Código de HttpsError pero de infraestructura (internal/unavailable/etc.) — se homogeniza el mensaje igual.
    return new HttpsError('internal', GENERIC_INTERNAL_MESSAGE)
  }
  return new HttpsError('internal', GENERIC_INTERNAL_MESSAGE)
}
