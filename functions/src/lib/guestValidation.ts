// Puerto Node de las validaciones de forma que hoy hace registerWalkInGuest
// del lado cliente (src/firebase/capacity.ts) para el auto-registro público.
// Constantes duplicadas a propósito (functions/ no importa nada de src/, ver
// functions/src/index.ts) — deben coincidir con src/utils/validation.ts.
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
