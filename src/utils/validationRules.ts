export const PASSWORD_MIN_LENGTH = 8
// Al menos una mayúscula, una minúscula y un número — el largo mínimo se
// valida aparte (PASSWORD_MIN_LENGTH) porque este patrón no exige longitud.
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/
export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con mayúscula, minúscula y número.`

export const EVENT_CAPACITY_MIN = 1
export const CAPACITY_ERROR_MESSAGE = 'El límite de invitados debe ser un número mayor a 0.'

export const EVENT_NAME_MAX = 100

/**
 * Filtra el input crudo del campo "precio del boleto" a dígitos + un solo
 * punto decimal, truncado a `maxDecimals`. `type="number"` no bloquea
 * pegar/tipear más decimales de los que `step` sugiere (step solo afecta
 * las flechas nativas) — sin esto, un precio como "10.999" se guardaba tal
 * cual.
 */
export function sanitizeDecimalInput(raw: string, maxDecimals = 2): string {
  const [intPart = '', ...rest] = raw.replace(/[^\d.]/g, '').split('.')
  if (rest.length === 0) return intPart
  return `${intPart}.${rest.join('').slice(0, maxDecimals)}`
}

/** Único lugar de verdad para "¿esta contraseña cumple los requisitos?" — si cambia el requisito, cambia acá. */
export function getPasswordError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`
  }
  if (!PASSWORD_PATTERN.test(password)) {
    return 'La contraseña debe incluir mayúscula, minúscula y número.'
  }
  return null
}

/** Parsea el input crudo del campo "límite de invitados" y valida contra EVENT_CAPACITY_MIN. */
export function parseCapacity(rawValue: string): { value: number; error: string | null } {
  const value = parseInt(rawValue, 10)
  if (!rawValue || !Number.isInteger(value) || value < EVENT_CAPACITY_MIN) {
    return { value, error: CAPACITY_ERROR_MESSAGE }
  }
  return { value, error: null }
}
