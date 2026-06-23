export const PASSWORD_MIN_LENGTH = 6
// Al menos una mayúscula, una minúscula y un número — el largo mínimo se
// valida aparte (PASSWORD_MIN_LENGTH) porque este patrón no exige longitud.
export const PASSWORD_PATTERN = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/
export const PASSWORD_HINT = `Mínimo ${PASSWORD_MIN_LENGTH} caracteres, con mayúscula, minúscula y número.`

export const EVENT_CAPACITY_MIN = 1
export const CAPACITY_ERROR_MESSAGE = 'El límite de invitados debe ser un número mayor a 0.'

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
