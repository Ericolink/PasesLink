import { parsePhoneNumberFromString } from 'libphonenumber-js/min'
import type { CountryCode } from 'libphonenumber-js/min'

// País por defecto cuando el número no trae "+" ni código de país: PaseLink
// nació en México y la mayoría de los teléfonos guardados sin prefijo son
// locales mexicanos. Es solo un último recurso — ver toWhatsAppPhone.
const DEFAULT_COUNTRY: CountryCode = 'MX'

// Normaliza un teléfono (guardado como se haya tecleado: con o sin "+",
// espacios, guiones, paréntesis, con o sin código de país) al formato que
// wa.me exige: solo dígitos, sin "+".
//
// No asume que todos los números son mexicanos: usa libphonenumber-js (con
// su metadata real de códigos de país) para interpretar el número. Si el
// texto ya trae "+", ese código de país manda y nunca se toca. Si no trae
// "+", se intenta interpretar como número local de `defaultCountry` — y solo
// si eso no da un número válido (p. ej. quedó guardado ya con su código de
// país pero sin "+") se cae a simplemente limpiar los caracteres no
// numéricos, sin agregar ni quitar nada.
//
// Un número local sin "+" y sin código de país es ambiguo por naturaleza
// (ej. un celular de EE.UU. tecleado como "9155551234" es indistinguible de
// un número mexicano de 10 dígitos): en ese caso se asume `defaultCountry`
// como mejor esfuerzo, igual que antes.
export function toWhatsAppPhone(raw: string, defaultCountry: CountryCode = DEFAULT_COUNTRY): string {
  if (!raw.trim()) return ''

  const hasExplicitCountryCode = raw.trim().startsWith('+')
  const parsed = parsePhoneNumberFromString(raw, hasExplicitCountryCode ? undefined : defaultCountry)
  if (parsed?.isValid()) {
    return parsed.number.replace(/^\+/, '')
  }

  return raw.replace(/\D/g, '')
}
