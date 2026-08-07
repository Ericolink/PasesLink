// Puerto Node de las validaciones de forma que hoy hace registerWalkInGuest
// del lado cliente (src/firebase/capacity.ts) para el auto-registro público.
// Constantes duplicadas a propósito (functions/ no importa nada de src/, ver
// functions/src/index.ts) — deben coincidir con src/utils/validation.ts.
export const GUEST_NAME_PART_MAX = 60
export const GUEST_FULL_NAME_MAX = 121
export const GUEST_EMAIL_MAX = 120
export const GUEST_PHONE_MAX = 30
export const GUEST_CUSTOM_FIELD_VALUE_MAX = 300
export const GUEST_CUSTOM_FIELD_MAX_COUNT = 30
export const GUEST_MAX_COMPANIONS = 20
export const GUEST_LEGACY_MAX_COMPANIONS = 9

export class GuestValidationError extends Error {}

export function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new GuestValidationError(`${label} es obligatorio.`)
  return trimmed
}

export function requireMaxLength(value: string, max: number, label: string): string {
  if (value.length > max) {
    throw new GuestValidationError(`${label} no puede superar los ${max} caracteres.`)
  }
  return value
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Puerto de requireValidEmail (src/utils/validation.ts) — usada por
// addGuestsFromRows.ts, la única de las tres altas manuales que acepta email.
export function requireValidEmail(value: string, label: string): string {
  const trimmed = requireNonEmpty(value, label)
  if (!EMAIL_REGEX.test(trimmed)) {
    throw new GuestValidationError(`${label} no tiene un formato válido.`)
  }
  return trimmed
}

// Mismo criterio que resolveMaxCompanions en src/firebase/guests.ts.
export function resolveMaxCompanions(maxCompanions: number | undefined): number {
  return Math.min(Math.max(maxCompanions ?? GUEST_LEGACY_MAX_COMPANIONS, 0), GUEST_MAX_COMPANIONS)
}

export function validateCustomData(customData: Record<string, string> | undefined): Record<string, string> {
  const entries = Object.entries(customData || {})
  if (entries.length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new GuestValidationError('El formulario tiene demasiados campos.')
  }
  for (const [, value] of entries) {
    requireMaxLength(value, GUEST_CUSTOM_FIELD_VALUE_MAX, 'Uno de los campos del formulario')
  }
  return customData || {}
}

export type CustomFieldType = 'text' | 'number' | 'email' | 'phone' | 'select'

export interface CustomFieldOptionDef {
  id: string
}

// Forma mínima de EventData.customFields (src/types/index.ts) que esta
// validación necesita — functions/ no importa nada de src/ (ver comentario
// de archivo), así que es un puerto parcial, no la interfaz completa.
export interface CustomFieldDef {
  id: string
  label: string
  type: CustomFieldType
  required: boolean
  options?: CustomFieldOptionDef[]
}

// Auto-registro público (registerWalkInGuest): a diferencia de
// validateCustomData (forma genérica, reutilizada por las altas del
// organizador, que confía en que quien arma el payload ya conoce los campos
// reales del evento), acá el payload viene de un cliente no confiable — se
// valida contra la definición REAL de campos del evento (EventData.
// customFields), tomada del propio documento leído en la transacción, nunca
// de lo que mande el cliente. Cierra 3 formas de manipular el formulario:
// inventarse un field id que no exista, saltarse un campo obligatorio, o
// mandar en un 'select' un valor que no sea una de las opciones que el
// organizador configuró.
export function validatePublicCustomData(
  customData: Record<string, string> | undefined,
  fields: CustomFieldDef[] | undefined,
): Record<string, string> {
  const entries = Object.entries(customData || {})
  if (entries.length > GUEST_CUSTOM_FIELD_MAX_COUNT) {
    throw new GuestValidationError('El formulario tiene demasiados campos.')
  }
  const fieldsById = new Map((fields || []).map((f) => [f.id, f]))

  for (const [fieldId, rawValue] of entries) {
    const field = fieldsById.get(fieldId)
    if (!field) {
      throw new GuestValidationError('El formulario tiene un campo que no corresponde a este evento.')
    }
    if (typeof rawValue !== 'string') {
      throw new GuestValidationError(`${field.label} no tiene un formato válido.`)
    }
    requireMaxLength(rawValue, GUEST_CUSTOM_FIELD_VALUE_MAX, field.label)
    if (field.type === 'select' && rawValue.trim() !== '') {
      const validOptionIds = new Set((field.options || []).map((o) => o.id))
      if (!validOptionIds.has(rawValue)) {
        throw new GuestValidationError(`${field.label} tiene un valor que no es una opción válida.`)
      }
    }
  }

  for (const field of fields || []) {
    if (field.required && !customData?.[field.id]?.trim()) {
      throw new GuestValidationError(`${field.label} es obligatorio.`)
    }
  }

  return customData || {}
}
