// Límites compartidos para contenido público (Wall, Waitlist). Estos valores
// deben coincidir con los que validan firestore.rules — son la última línea
// de defensa real, ya que cualquier cliente puede escribir directo a
// Firestore sin pasar por estas funciones. Ver firestore.rules.
export const WALL_TEXT_MAX = 500
export const WALL_NAME_MAX = 60
export const WALL_TOKEN_MAX = 100
export const WALL_PHOTO_URL_MAX = 500
export const WALL_TYPES = ['comment', 'question', 'music', 'idea'] as const

export const WAITLIST_NAME_MAX = 60
export const WAITLIST_PHONE_MAX = 30

// Auto-registro público de invitados (registerWalkInGuest). `name`/`lastName`
// se capturan por separado en la UI pero se combinan en un solo `name` antes
// de llegar a la capa de aplicación — por eso el máximo combinado es
// (parte * 2) + 1 espacio, no un número arbitrario.
export const GUEST_NAME_PART_MAX = 60
export const GUEST_FULL_NAME_MAX = GUEST_NAME_PART_MAX * 2 + 1
export const GUEST_PHONE_MAX = 30
export const GUEST_EMAIL_MAX = 120
// customData: valores de los campos personalizados que el organizador define
// para su evento (texto/número/email/teléfono), llenados por el público.
export const GUEST_CUSTOM_FIELD_VALUE_MAX = 300
export const GUEST_CUSTOM_FIELD_MAX_COUNT = 30

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} es obligatorio.`)
  return trimmed
}

export function requireMaxLength(value: string, max: number, label: string): string {
  if (value.length > max) {
    throw new Error(`${label} no puede superar los ${max} caracteres.`)
  }
  return value
}
