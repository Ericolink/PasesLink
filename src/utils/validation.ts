// Límites compartidos para contenido público (Wall). Estos valores deben
// coincidir con los que validan firestore.rules — son la última línea de
// defensa real, ya que cualquier cliente puede escribir directo a Firestore
// sin pasar por estas funciones. Ver firestore.rules.
export const WALL_TEXT_MAX = 500
export const WALL_NAME_MAX = 60
export const WALL_TOKEN_MAX = 100
export const WALL_PHOTO_URL_MAX = 500
export const WALL_TYPES = ['comment', 'question', 'music', 'idea'] as const
// Límite del texto que acompaña a una foto (colección `photos`, campo
// `caption`) — más corto que WALL_TEXT_MAX porque hoy vive server-side en
// firestore.rules como un límite propio, independiente del de un comentario.
export const PHOTO_CAPTION_MAX = 120

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
// Tope de "¿cuántos vienen?" en el autoregistro público (EventJoin) — antes
// de este campo, esa vía nunca exponía cantidad de acompañantes (eso lo
// controlaba solo el organizador autenticado vía CompanionFieldsEditor), así
// que no existía ningún límite explícito para una entrada anónima.
export const GUEST_MAX_PARTY_SIZE = 10
// Tope de "cantidad de integrantes" al crear/editar una familia o grupo desde
// el panel del organizador (GuestAddForm/GuestList) — a diferencia de
// GUEST_MAX_PARTY_SIZE (autoregistro público, sin control del organizador),
// esta vía la usa un organizador autenticado, por eso el límite es más alto.
export const GUEST_GROUP_MAX_MEMBERS = 50

// Buzón de feedback (src/pages/Feedback.tsx, src/firebase/feedback.ts). Deben
// coincidir con isValidFeedbackCreate() en firestore.rules — esa es la última
// barrera real ante un cliente que evite por completo esta capa.
export const FEEDBACK_SUBJECT_MAX = 100
export const FEEDBACK_MESSAGE_MIN = 10
export const FEEDBACK_MESSAGE_MAX = 2000
export const FEEDBACK_EMAIL_MAX = 120
export const FEEDBACK_CATEGORIES = ['suggestion', 'bug', 'comment', 'question', 'inappropriate', 'feature_request', 'other'] as const

// Reportes de contenido del muro (src/firebase/moderation.ts). Deben coincidir
// con isValidReportCreate() en firestore.rules — misma razón que el resto de
// los límites de este archivo: esa es la última barrera real.
export const REPORT_REASON_MIN = 10
export const REPORT_REASON_MAX = 500
export const REPORT_CONTENT_SNAPSHOT_MAX = 1000
export const REPORT_NAME_MAX = 120
export const REPORT_EVENT_NAME_MAX = 200

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

export function requireMinLength(value: string, min: number, label: string): string {
  if (value.trim().length < min) {
    throw new Error(`${label} debe tener al menos ${min} caracteres.`)
  }
  return value
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function requireValidEmail(value: string, label: string): string {
  const trimmed = requireNonEmpty(value, label)
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new Error(`${label} no tiene un formato válido.`)
  }
  return trimmed
}

// Quita caracteres de control (incluido null byte) que no aportan nada a un
// mensaje de texto y podrían romper su renderizado — conserva saltos de línea
// (\n, \x0A) porque el mensaje del buzón es multilínea. No reemplaza el
// escapado de React (que ya evita XSS), solo limpia el dato guardado.
export function sanitizeFeedbackText(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.trim().replace(/[\x00-\x09\x0B\x0C\x0E-\x1F]/g, '')
}
