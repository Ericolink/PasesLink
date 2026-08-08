// Puerto de src/utils/phone.ts (toWhatsAppPhone) — mismo contrato exacto,
// duplicado en vez de cross-importado porque functions/ es un runtime
// standalone (ver comentario de cabecera de functions/src/index.ts). Única
// consumidora: lib/waChannel.ts, para construir el número E.164 que exige
// la API de Meta a partir de `phone`/`phoneCountry` tal como se guardan hoy.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'

const DEFAULT_COUNTRY: CountryCode = 'MX'

export function toWhatsAppPhone(raw: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string {
  if (!raw.trim()) return ''

  const hasExplicitCountryCode = raw.trim().startsWith('+')
  const parsed = parsePhoneNumberFromString(raw, hasExplicitCountryCode ? undefined : defaultCountry)
  if (parsed?.isValid()) {
    return parsed.number.replace(/^\+/, '')
  }

  return raw.replace(/\D/g, '')
}

// A diferencia de toWhatsAppPhone (que siempre devuelve algo, "mejor
// esfuerzo"), acá sí importa saber si el número es un E.164 realmente
// válido antes de gastar una llamada a la API de Meta — un número que solo
// pasó por el fallback de "limpiar caracteres" (ver comentario de arriba)
// no sirve como destinatario real.
export function isValidWhatsAppPhone(raw: string, defaultCountry?: CountryCode): boolean {
  if (!raw.trim()) return false
  const hasExplicitCountryCode = raw.trim().startsWith('+')
  const parsed = parsePhoneNumberFromString(raw, hasExplicitCountryCode ? undefined : (defaultCountry ?? DEFAULT_COUNTRY))
  return parsed?.isValid() ?? false
}

// Para guardar en `sendLog` sin exponer el número completo (§18 del issue
// de WhatsApp: "no registres en logs números completos") — deja los
// últimos 4 dígitos, suficiente para que soporte confirme "sí, es este
// invitado" sin poder reconstruir el número real.
export function redactPhone(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length <= 4) return '***'
  return `***${digits.slice(-4)}`
}
